"""
AI Visual Dialogue Assistant — FastAPI server.

Serves the frontend as static files and provides a WebSocket endpoint
that relays audio/video data to Qwen3-Omni-Flash-Realtime.
"""
import logging
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from config import SERVER_HOST, SERVER_PORT, STATIC_DIR

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


# ── WebSocket endpoint ───────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    logger.info("Browser WebSocket connected")

    try:
        while True:
            data = await ws.receive_text()
            # Echo back for now (PR #2 will add Qwen relay)
            await ws.send_text(f'{{"type":"status","state":"echo","received":"{data[:50]}..."}}')
    except WebSocketDisconnect:
        logger.info("Browser WebSocket disconnected")
    except Exception as exc:
        logger.error(f"WebSocket error: {exc}")
        try:
            await ws.close()
        except Exception:
            pass


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
