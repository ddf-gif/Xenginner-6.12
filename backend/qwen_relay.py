"""
Qwen3-Omni-Flash-Realtime WebSocket relay client.

Manages a raw WebSocket connection to the DashScope Realtime API,
handling session configuration, audio/video buffer appends, and
response event dispatching via asyncio callbacks.
"""
import asyncio
import json
import logging
from typing import Callable, Optional

import websockets
from websockets.asyncio.client import ClientConnection

from config import QWEN_API_KEY, QWEN_WS_URL, MAX_ROUNDS, MAX_IDLE_SECONDS
from protocol import (
    QwenEvent,
    QwenServerEvent,
    StatusState,
    make_event_id,
    make_qwen_message,
    session_update_config,
)

logger = logging.getLogger("qwen_relay")

# ── Event callbacks type ─────────────────────────────────────────────
# Called when a Qwen server event is received.
# Args: (event_type: str, payload: dict)
EventHandler = Callable[[str, dict], None]


class QwenRelayClient:
    """
    Async client that connects to Qwen Realtime API over WebSocket
    and relays bidirectional messages.

    Usage:
        client = QwenRelayClient(on_event=my_handler)
        await client.connect()
        await client.send_session_update(instructions="You are a visual assistant.")
        await client.send_audio_chunk(base64_audio)
        await client.send_video_frame(base64_jpeg)
        # ... response events arrive via on_event callback ...
        await client.disconnect()
    """

    def __init__(self, on_event: Optional[EventHandler] = None,
                 on_restart: Optional[Callable[[], None]] = None):
        self._ws: Optional[ClientConnection] = None
        self._on_event = on_event
        self._on_restart = on_restart
        self._connected = False
        self._round_count = 0
        self._last_activity = 0.0
        self._listen_task: Optional[asyncio.Task] = None
        self._idle_task: Optional[asyncio.Task] = None
        self._session_instructions = "你是AI视觉助手，请用中文简洁回答用户的问题。"
        self._api_key = QWEN_API_KEY
        self._ws_url = QWEN_WS_URL

    def set_model_config(self, model: str = "qwen", api_key: str = "", api_url: str = ""):
        if model == "openai":
            self._ws_url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview"
            self._api_key = api_key or QWEN_API_KEY
        elif model == "custom" and api_url:
            self._ws_url = api_url
            self._api_key = api_key or QWEN_API_KEY
        else:
            self._ws_url = QWEN_WS_URL
            self._api_key = api_key or QWEN_API_KEY
        logger.info("Model: %s -> %s", model, self._ws_url[:60])

    # ── Connection lifecycle ─────────────────────────────────────────

    async def connect(self) -> bool:
        """Open WebSocket to Qwen DashScope and perform auth handshake."""
        try:
            # Headers for DashScope auth
            extra_headers = {
                "Authorization": f"Bearer {self._api_key}",
            }
            self._ws = await websockets.connect(
                self._ws_url,
                additional_headers=extra_headers,
                ping_interval=30,
                ping_timeout=10,
                close_timeout=5,
            )
            self._connected = True
            self._round_count = 0
            self._last_activity = asyncio.get_event_loop().time()
            logger.info("Connected to Qwen Realtime API")

            # Start listener and idle watchdog
            self._listen_task = asyncio.create_task(self._listen_loop())
            self._idle_task = asyncio.create_task(self._idle_watchdog())
            return True

        except Exception as exc:
            logger.error(f"Failed to connect to Qwen: {exc}")
            self._connected = False
            return False

    async def disconnect(self):
        """Close the Qwen WebSocket connection gracefully."""
        self._connected = False
        if self._listen_task:
            self._listen_task.cancel()
            self._listen_task = None
        if self._idle_task:
            self._idle_task.cancel()
            self._idle_task = None
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
        logger.info("Disconnected from Qwen Realtime API")

    @property
    def is_connected(self) -> bool:
        return self._connected and self._ws is not None

    @property
    def round_count(self) -> int:
        return self._round_count

    # ── Session configuration ─────────────────────────────────────────

    async def send_session_update(
        self,
        instructions: str = "你是AI视觉助手，请用中文简洁回答用户的问题。",
        modalities: Optional[list] = None,
        voice: str = "Cherry",
        turn_detection_type: str = "server_vad",
        temperature: float = 0.9,
        max_tokens: int = 1024,
    ):
        """Send session.update to configure the Qwen session."""
        config = session_update_config(
            modalities=modalities,
            voice=voice,
            instructions=instructions,
            turn_detection_type=turn_detection_type,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        self._session_instructions = instructions
        msg = make_qwen_message(QwenEvent.SESSION_UPDATE, **config)
        await self._send_raw(msg)
        logger.info("Sent session.update (instructions=%d chars)", len(instructions))

    # ── Media input ───────────────────────────────────────────────────

    async def send_audio_chunk(self, base64_audio: str):
        """Send a 100ms audio chunk (PCM16 16kHz mono, base64-encoded)."""
        if not self.is_connected:
            return
        msg = make_qwen_message(
            QwenEvent.INPUT_AUDIO_APPEND,
            audio=base64_audio,
        )
        await self._send_raw(msg)
        self._last_activity = asyncio.get_event_loop().time()

    async def send_video_frame(self, base64_jpeg: str):
        """Send a video frame (JPEG, base64-encoded, ≤256KB)."""
        if not self.is_connected:
            return
        msg = make_qwen_message(
            QwenEvent.INPUT_IMAGE_APPEND,
            image=base64_jpeg,
        )
        await self._send_raw(msg)
        self._last_activity = asyncio.get_event_loop().time()

    async def cancel_response(self):
        """Cancel the currently generating response."""
        if not self.is_connected:
            return
        msg = make_qwen_message(QwenEvent.RESPONSE_CANCEL)
        await self._send_raw(msg)
        logger.info("Sent response.cancel")

    async def restart_session(self):
        """Restart the Qwen session (for 8-round limit or error recovery)."""
        logger.info("Restarting Qwen session (round %d/%d)", self._round_count, MAX_ROUNDS)
        # Disconnect old session
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
        if self._listen_task:
            self._listen_task.cancel()
            self._listen_task = None

        # Reconnect with same instructions
        connected = await self.connect()
        if connected:
            await self.send_session_update(instructions=self._session_instructions)
            if self._on_restart:
                self._on_restart()
            logger.info("Session restarted successfully")
            return True
        return False

    async def _idle_watchdog(self):
        """Monitor idle time and disconnect if inactive too long."""
        try:
            while self._connected:
                await asyncio.sleep(10)
                idle = asyncio.get_event_loop().time() - self._last_activity
                if idle > MAX_IDLE_SECONDS:
                    logger.warning("Idle timeout: %.0fs > %ds, disconnecting",
                                   idle, MAX_IDLE_SECONDS)
                    self._connected = False
                    if self._on_event:
                        self._on_event(QwenServerEvent.ERROR, {
                            "code": "idle_timeout",
                            "message": f"会话空闲超时（{MAX_IDLE_SECONDS}秒），已自动断开",
                        })
                    break
        except asyncio.CancelledError:
            pass

    # ── Internal ──────────────────────────────────────────────────────

    async def _send_raw(self, message: str):
        """Send a raw JSON string over the Qwen WebSocket."""
        if self._ws:
            try:
                await self._ws.send(message)
            except Exception as exc:
                logger.error(f"Failed to send to Qwen: {exc}")
                self._connected = False

    async def _listen_loop(self):
        """Continuously read messages from Qwen WebSocket and dispatch events."""
        try:
            async for raw_message in self._ws:
                try:
                    event = json.loads(raw_message)
                except json.JSONDecodeError:
                    logger.warning("Failed to parse Qwen message: %s", raw_message[:100])
                    continue

                event_type = event.get("type", "")
                logger.debug("Qwen event: %s", event_type)

                # Track rounds and auto-restart near limit
                if event_type == QwenServerEvent.RESPONSE_DONE:
                    self._round_count += 1
                    logger.info("Round %d/%d completed", self._round_count, MAX_ROUNDS)

                    if self._round_count >= MAX_ROUNDS - 1:
                        logger.warning("Approaching round limit, restarting session...")
                        asyncio.create_task(self.restart_session())

                # Dispatch to callback
                if self._on_event:
                    try:
                        self._on_event(event_type, event)
                    except Exception as exc:
                        logger.error("Event handler error for %s: %s", event_type, exc)

        except asyncio.CancelledError:
            logger.debug("Listen loop cancelled")
        except websockets.exceptions.ConnectionClosed as exc:
            logger.warning("Qwen WebSocket closed: %s", exc)
            self._connected = False
        except Exception as exc:
            logger.error("Qwen listen loop error: %s", exc)
            self._connected = False
