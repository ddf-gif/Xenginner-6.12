"""
Application configuration.
Load .env file first, then read settings from environment variables.
"""
import os
from pathlib import Path

# ── Load .env file ───────────────────────────────────────────────────
_ENV_FILE = Path(__file__).parent / ".env"
if _ENV_FILE.is_file():
    with open(_ENV_FILE, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip().strip('"').strip("'")
            if key not in os.environ:
                os.environ[key] = value

# ── Qwen DashScope API ──────────────────────────────────────────────
QWEN_API_KEY = os.getenv("QWEN_API_KEY", "")
QWEN_WS_URL = os.getenv(
    "QWEN_WS_URL",
    "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-omni-flash-realtime",
)

# ── Audio parameters ─────────────────────────────────────────────────
AUDIO_SAMPLE_RATE = 16000       # Qwen requires 16 kHz PCM16 mono
AUDIO_CHUNK_MS = 100            # 100 ms per audio chunk
AUDIO_CHUNK_BYTES = 3200        # 16000 Hz * 2 bytes * 0.1 s = 3200 bytes
AUDIO_BIT_DEPTH = 16            # bits per sample

# ── Video parameters ─────────────────────────────────────────────────
VIDEO_WIDTH = 854               # 480p (16:9)
VIDEO_HEIGHT = 480
VIDEO_FPS = 1                   # capture 1 frame per second
VIDEO_JPEG_QUALITY = 0.6        # JPEG compression quality (0.0 - 1.0)
VIDEO_MAX_BASE64_KB = 256       # Qwen API limit for base64-encoded frame

# ── Server ───────────────────────────────────────────────────────────
SERVER_HOST = os.getenv("SERVER_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("SERVER_PORT", "8000"))
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")

# ── Session limits (flash model) ─────────────────────────────────────
MAX_ROUNDS = 8                  # qwen3-omni-flash-realtime 8-round limit
MAX_IDLE_SECONDS = 120          # auto-disconnect after 2 min of silence
SESSION_MAX_DURATION = 7200     # 120 minutes hard limit
