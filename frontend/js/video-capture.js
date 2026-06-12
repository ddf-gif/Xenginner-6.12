/**
 * Video frame capture pipeline.
 *
 * Captures frames from a <video> element at 1fps, resizes to 480p
 * via an offscreen <canvas>, encodes as JPEG, validates size ≤256KB,
 * and emits base64-encoded frames via callbacks.
 *
 * Usage:
 *   const vc = VideoCapture();
 *   vc.onFrame = (base64jpeg) => { /* send via WS */ };
 *   await vc.start(videoElement, canvasElement);
 *   vc.stop();
 */

const VideoCapture = (() => {
    // ── Constants ──────────────────────────────────────────────────
    const TARGET_WIDTH = 854;           // 480p (16:9)
    const TARGET_HEIGHT = 480;
    const FPS = 1;                      // capture 1 frame per second
    const JPEG_QUALITY = 0.6;           // compression level
    const MIN_QUALITY = 0.3;            // fallback quality floor
    const MAX_BASE64_BYTES = 256 * 1024; // Qwen API limit

    // ── Internal state ────────────────────────────────────────────
    let _videoEl = null;
    let _canvasEl = null;
    let _ctx = null;
    let _intervalId = null;
    let _onFrame = null;
    let _running = false;
    let _frameCount = 0;

    // ── Public API ─────────────────────────────────────────────────
    /**
     * Start capturing frames from a video element.
     * @param {HTMLVideoElement} videoEl - the live camera preview
     * @param {HTMLCanvasElement} canvasEl - hidden canvas for frame processing
     */
    function start(videoEl, canvasEl) {
        if (_running) return;

        _videoEl = videoEl;
        _canvasEl = canvasEl;

        // Configure canvas to target resolution
        _canvasEl.width = TARGET_WIDTH;
        _canvasEl.height = TARGET_HEIGHT;
        _ctx = _canvasEl.getContext('2d', { willReadFrequently: true });

        _frameCount = 0;
        _running = true;

        const intervalMs = Math.round(1000 / FPS);
        _intervalId = setInterval(_captureFrame, intervalMs);

        console.log(
            `VideoCapture started: ${TARGET_WIDTH}x${TARGET_HEIGHT}, ` +
            `${FPS}fps, JPEG q=${JPEG_QUALITY}`
        );
    }

    function stop() {
        _running = false;
        if (_intervalId) {
            clearInterval(_intervalId);
            _intervalId = null;
        }
        _videoEl = null;
        _canvasEl = null;
        _ctx = null;
        console.log(`VideoCapture stopped (${_frameCount} frames captured)`);
    }

    // ── Callback setters ──────────────────────────────────────────
    Object.defineProperty(self, 'onFrame', {
        set(fn) { _onFrame = fn; },
        get() { return _onFrame; },
    });

    // ── Internal: frame capture ────────────────────────────────────
    function _captureFrame() {
        if (!_running || !_videoEl || !_ctx) return;
        if (_videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

        try {
            // Draw video frame to canvas (resamples to 480p)
            _ctx.drawImage(_videoEl, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);

            // Encode as JPEG with quality fallback
            _encodeWithFallback(JPEG_QUALITY, (base64) => {
                if (!_running) return;

                _frameCount++;
                if (_onFrame) {
                    _onFrame(base64);
                }

                // Log first few frames for debugging
                if (_frameCount <= 3) {
                    console.log(
                        `VideoCapture frame #${_frameCount}: ` +
                        `${(base64.length / 1024).toFixed(1)} KB base64`
                    );
                }
            });
        } catch (err) {
            console.error('VideoCapture frame error:', err);
        }
    }

    /**
     * Try encoding at a given quality; if the base64 exceeds the limit,
     * retry at progressively lower quality until within bounds.
     */
    function _encodeWithFallback(quality, callback) {
        _canvasEl.toBlob(
            (blob) => {
                if (!blob) {
                    console.error('VideoCapture: toBlob returned null');
                    return;
                }

                const reader = new FileReader();
                reader.onload = () => {
                    // reader.result is "data:image/jpeg;base64,xxxx"
                    const dataUrl = reader.result;
                    const base64 = dataUrl.split(',')[1] || '';

                    // Check size
                    if (base64.length > MAX_BASE64_BYTES && quality > MIN_QUALITY) {
                        // Retry with lower quality
                        console.warn(
                            `Frame too large (${(base64.length/1024).toFixed(0)}KB), ` +
                            `retrying at quality ${(quality - 0.1).toFixed(1)}`
                        );
                        _encodeWithFallback(quality - 0.1, callback);
                        return;
                    }

                    callback(base64);
                };
                reader.readAsDataURL(blob);
            },
            'image/jpeg',
            quality
        );
    }

    // ── Getters ────────────────────────────────────────────────────
    function isRunning() { return _running; }
    function frameCount() { return _frameCount; }

    // ── Module object ──────────────────────────────────────────────
    const self = {
        start,
        stop,
        get isRunning() { return isRunning(); },
        get frameCount() { return frameCount(); },
        set onFrame(fn) { _onFrame = fn; },
        get onFrame() { return _onFrame; },
    };

    return self;
})();
