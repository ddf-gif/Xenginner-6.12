"""
AI Visual Dialogue Assistant — FastAPI server.

Serves the frontend as static files and provides a WebSocket endpoint
that relays audio/video data to Qwen3-Omni-Flash-Realtime.
"""
import asyncio
import json
import logging
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from config import SERVER_HOST, SERVER_PORT, STATIC_DIR
from qwen_relay import QwenRelayClient
from protocol import (
    BackendEvent,
    QwenServerEvent,
    StatusState,
    make_browser_message,
)

# ── Logging ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("server")

# ── FastAPI app ──────────────────────────────────────────────────────
app = FastAPI(title="AI Visual Dialogue Assistant")

# ── Static file serving (frontend) ───────────────────────────────────
if os.path.isdir(STATIC_DIR):
    app.mount("/css", StaticFiles(directory=os.path.join(STATIC_DIR, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(STATIC_DIR, "js")), name="js")


@app.get("/")
async def index():
    """Serve the main HTML page."""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return {"status": "ok", "message": "Frontend not yet built. Place index.html in frontend/."}


@app.get("/manifest.json")
async def manifest():
    return FileResponse(os.path.join(STATIC_DIR, "manifest.json"))


@app.get("/sw.js")
async def service_worker():
    return FileResponse(os.path.join(STATIC_DIR, "sw.js"), media_type="application/javascript")


# ── WebSocket endpoint ───────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    logger.info("Browser WebSocket connected")

    qwen = QwenRelayClient(
        on_event=lambda etype, payload: asyncio.create_task(
            _relay_qwen_event(ws, etype, payload)
        ),
        on_restart=lambda: asyncio.create_task(
            ws.send_text(make_browser_message(
                BackendEvent.STATUS, state=StatusState.LISTENING
            ))
        ),
    )

    try:
        while True:
            data = await ws.receive_text()

            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                await ws.send_text(
                    make_browser_message(BackendEvent.ERROR, code="bad_json", message="Invalid JSON")
                )
                continue

            msg_type = msg.get("type", "")

            if msg_type == "start_session":
                connected = await qwen.connect()
                if connected:
                    instructions = msg.get("instructions", "你是AI视觉助手，请用中文简洁回答用户的问题。")
                    await qwen.send_session_update(instructions=instructions)
                    await ws.send_text(
                        make_browser_message(BackendEvent.STATUS, state=StatusState.LISTENING)
                    )
                else:
                    await ws.send_text(
                        make_browser_message(
                            BackendEvent.ERROR,
                            code="qwen_connect_failed",
                            message="Failed to connect to AI service",
                        )
                    )

            elif msg_type == "audio":
                await qwen.send_audio_chunk(msg.get("data", ""))

            elif msg_type == "video":
                await qwen.send_video_frame(msg.get("data", ""))

            elif msg_type == "cancel":
                await qwen.cancel_response()

            elif msg_type == "end_session":
                await qwen.disconnect()
                await ws.send_text(
                    make_browser_message(BackendEvent.STATUS, state=StatusState.IDLE)
                )

    except WebSocketDisconnect:
        logger.info("Browser WebSocket disconnected")
    except Exception as exc:
        logger.error(f"WebSocket error: {exc}")
    finally:
        await qwen.disconnect()
        try:
            await ws.close()
        except Exception:
            pass


async def _relay_qwen_event(ws: WebSocket, event_type: str, payload: dict):
    """Relay Qwen server events back to the browser."""
    # Track if we've sent "speaking" for this response round
    if not hasattr(_relay_qwen_event, '_speaking_sent'):
        _relay_qwen_event._speaking_sent = False

    try:
        logger.info("Qwen event: %s keys=%s", event_type, list(payload.keys())[:5])

        if event_type == QwenServerEvent.INPUT_TRANSCRIPTION_DONE:
            # User's spoken words recognized → show in chat
            transcript = payload.get("transcript", "")
            if transcript:
                await ws.send_text(
                    make_browser_message("user_speech", text=transcript)
                )

        elif event_type == QwenServerEvent.SPEECH_STARTED:
            _relay_qwen_event._speaking_sent = False

        elif event_type == QwenServerEvent.SPEECH_STOPPED:
            await ws.send_text(
                make_browser_message(BackendEvent.STATUS, state=StatusState.THINKING)
            )

        elif event_type == QwenServerEvent.AUDIO_TRANSCRIPT_DELTA:
            # AI response transcript text → show as subtitle & chat
            if not _relay_qwen_event._speaking_sent:
                await ws.send_text(
                    make_browser_message(BackendEvent.STATUS, state=StatusState.SPEAKING)
                )
                _relay_qwen_event._speaking_sent = True
            # Try multiple possible field names for the text content
            logger.info("TRANSCRIPT payload: %s", json.dumps(payload, ensure_ascii=False)[:200])
            text = payload.get("delta") or payload.get("text") or payload.get("transcript") or ""
            if text:
                await ws.send_text(
                    make_browser_message(BackendEvent.TEXT_DELTA, text=text)
                )

        elif event_type == QwenServerEvent.AUDIO_TRANSCRIPT_DONE:
            await ws.send_text(
                make_browser_message(BackendEvent.TEXT_DONE, text=payload.get("transcript", ""))
            )

        elif event_type == QwenServerEvent.AUDIO_DELTA:
            if not _relay_qwen_event._speaking_sent:
                await ws.send_text(
                    make_browser_message(BackendEvent.STATUS, state=StatusState.SPEAKING)
                )
                _relay_qwen_event._speaking_sent = True
            await ws.send_text(
                make_browser_message(BackendEvent.AUDIO_DELTA, data=payload.get("delta", ""))
            )

        elif event_type == QwenServerEvent.AUDIO_DONE:
            await ws.send_text(make_browser_message(BackendEvent.AUDIO_DONE))

        elif event_type == QwenServerEvent.RESPONSE_DONE:
            _relay_qwen_event._speaking_sent = False
            await ws.send_text(
                make_browser_message(BackendEvent.STATUS, state=StatusState.LISTENING)
            )

        elif event_type == QwenServerEvent.ERROR:
            await ws.send_text(
                make_browser_message(
                    BackendEvent.ERROR,
                    code=payload.get("code", "qwen_error"),
                    message=payload.get("message", "AI service error"),
                )
            )

    except Exception as exc:
        logger.error(f"Failed to relay Qwen event to browser: {exc}")


# ── Health check ─────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "healthy"}


# ── Startup ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    logger.info(f"Frontend served from: {STATIC_DIR}")
    logger.info(f"Server starting at http://{SERVER_HOST}:{SERVER_PORT}")
    uvicorn.run(
        "main:app",
        host=SERVER_HOST,
        port=SERVER_PORT,
        reload=True,
        log_level="info",
    )
