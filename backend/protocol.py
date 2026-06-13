"""
Protocol constants for the Qwen3-Omni-Flash-Realtime WebSocket API.

Defines message types, event IDs, and serialization helpers for both
the browser↔backend custom protocol and the backend↔Qwen native protocol.
"""

import json
import time
import uuid
from typing import Optional

# ── Qwen Native Event Types (DashScope protocol) ─────────────────────

class QwenEvent:
    """Qwen WebSocket event types (client → server)."""
    SESSION_UPDATE = "session.update"
    INPUT_AUDIO_APPEND = "input_audio_buffer.append"
    INPUT_IMAGE_APPEND = "input_image_buffer.append"
    RESPONSE_CANCEL = "response.cancel"

class QwenServerEvent:
    """Qwen WebSocket event types (server → client)."""
    SESSION_CREATED = "session.created"
    SESSION_UPDATED = "session.updated"
    SPEECH_STARTED = "input_audio_buffer.speech_started"
    SPEECH_STOPPED = "input_audio_buffer.speech_stopped"
    # Qwen omni-flash-realtime uses audio_transcript events (not text.delta)
    INPUT_TRANSCRIPTION_DONE = "conversation.item.input_audio_transcription.completed"
    AUDIO_TRANSCRIPT_DELTA = "response.audio_transcript.delta"
    AUDIO_TRANSCRIPT_DONE = "response.audio_transcript.done"
    AUDIO_DELTA = "response.audio.delta"
    AUDIO_DONE = "response.audio.done"
    RESPONSE_DONE = "response.done"
    ERROR = "error"

# ── Browser ↔ Backend Custom Protocol ────────────────────────────────

class BrowserEvent:
    """Browser → Backend message types."""
    START_SESSION = "start_session"
    END_SESSION = "end_session"
    AUDIO = "audio"
    VIDEO = "video"
    COMMIT = "commit"
    CANCEL = "cancel"

class BackendEvent:
    """Backend → Browser message types."""
    STATUS = "status"
    TEXT_DELTA = "text_delta"
    TEXT_DONE = "text_done"
    AUDIO_DELTA = "audio_delta"
    AUDIO_DONE = "audio_done"
    TRANSCRIPT_DELTA = "transcript_delta"
    TRANSCRIPT_DONE = "transcript_done"
    ERROR = "error"

# ── Status States ────────────────────────────────────────────────────

class StatusState:
    CONNECTING = "connecting"
    LISTENING = "listening"
    THINKING = "thinking"
    SPEAKING = "speaking"
    ERROR = "error"
    IDLE = "idle"

# ── Helpers ──────────────────────────────────────────────────────────

def make_event_id() -> str:
    """Generate a unique event ID for Qwen protocol messages."""
    return f"evt_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"

def make_browser_message(msg_type: str, **kwargs) -> str:
    """Serialize a backend→browser message as JSON string."""
    payload = {"type": msg_type}
    payload.update(kwargs)
    return json.dumps(payload, ensure_ascii=False)

def make_qwen_message(msg_type: str, **kwargs) -> str:
    """Serialize a Qwen protocol message as JSON string."""
    payload = {"event_id": make_event_id(), "type": msg_type}
    payload.update(kwargs)
    return json.dumps(payload, ensure_ascii=False)

def session_update_config(
    modalities: Optional[list] = None,
    voice: str = "Cherry",
    instructions: str = "",
    turn_detection_type: str = "server_vad",
    threshold: float = 0.5,
    silence_duration_ms: int = 800,
    temperature: float = 0.9,
    max_tokens: int = 1024,
) -> dict:
    """Build the session.update payload for Qwen."""
    return {
        "session": {
            "modalities": modalities or ["text", "audio"],
            "voice": voice,
            "input_audio_format": "pcm",
            "output_audio_format": "pcm",
            "instructions": instructions,
            "turn_detection": {
                "type": turn_detection_type,
                "threshold": threshold,
                "silence_duration_ms": silence_duration_ms,
            },
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
    }
