/**
 * Video frame capture pipeline — with adaptive frame rate.
 *
 * 1fps when scene is changing, 0.2fps when static (saves ~80% video tokens).
 * Emits base64 JPEG frames via onFrame callback.
 */
const VideoCapture = (() => {
    const TARGET_WIDTH = 854;
    const TARGET_HEIGHT = 480;
    const JPEG_QUALITY = 0.6;
    const MIN_QUALITY = 0.3;
    const MAX_BASE64_BYTES = 256 * 1024;

    // Adaptive frame rate
    const FAST_INTERVAL = 1000;   // 1fps
    const SLOW_INTERVAL = 5000;   // 0.2fps
    const COMPARE_W = 160;        // low-res comparison size
    const COMPARE_H = 90;
    const MOTION_THRESHOLD = 0.03; // 3% pixels changed = motion
    const STABLE_FRAMES = 3;       // N still frames before slowing down

    let _videoEl = null, _canvasEl = null, _ctx = null;
    let _compareCanvas = null, _compareCtx = null;
    let _intervalId = null, _timeoutId = null;
    let _onFrame = null, _onFpsChange = null;
    let _running = false, _frameCount = 0, _stableCount = 0;
    let _currentFps = 1;
    let _prevPixels = null;

    function _initCompareCanvas() {
        if (!_compareCanvas) {
            _compareCanvas = document.createElement('canvas');
            _compareCanvas.width = COMPARE_W;
            _compareCanvas.height = COMPARE_H;
            _compareCtx = _compareCanvas.getContext('2d', { willReadFrequently: true });
        }
    }

    function _pixelDiff() {
        _compareCtx.drawImage(_videoEl, 0, 0, COMPARE_W, COMPARE_H);
        const data = _compareCtx.getImageData(0, 0, COMPARE_W, COMPARE_H).data;
        if (!_prevPixels) { _prevPixels = new Uint8Array(data); return 1.0; }

        let diff = 0;
        // Sample every 4th pixel for speed
        for (let i = 0; i < data.length; i += 16) {
            diff += Math.abs(data[i] - _prevPixels[i]);
        }
        const samples = data.length / 16;
        const avgDiff = diff / (samples * 255);
        _prevPixels = new Uint8Array(data);
        return avgDiff;
    }

    function _scheduleNext() {
        if (!_running) return;
        const interval = _currentFps >= 1 ? FAST_INTERVAL : SLOW_INTERVAL;
        _timeoutId = setTimeout(() => {
            _captureFrame();
            _scheduleNext();
        }, interval);
    }

    function _setFps(fps) {
        if (_currentFps === fps) return;
        _currentFps = fps;
        if (_onFpsChange) _onFpsChange(fps);
        console.log(`VideoCapture: adaptive fps → ${fps} fps`);
    }

    function start(videoEl, canvasEl) {
        if (_running) return;
        _videoEl = videoEl; _canvasEl = canvasEl;
        _canvasEl.width = TARGET_WIDTH; _canvasEl.height = TARGET_HEIGHT;
        _ctx = _canvasEl.getContext('2d', { willReadFrequently: true });
        _initCompareCanvas();
        _frameCount = 0; _stableCount = 0; _prevPixels = null;
        _currentFps = 1; _running = true;
        _scheduleNext();
        console.log(`VideoCapture started: ${TARGET_WIDTH}x${TARGET_HEIGHT}, adaptive fps`);
    }

    function stop() {
        _running = false;
        if (_timeoutId) { clearTimeout(_timeoutId); _timeoutId = null; }
        _videoEl = null; _canvasEl = null; _ctx = null;
        console.log(`VideoCapture stopped (${_frameCount} frames)`);
    }

    function _captureFrame() {
        if (!_running || !_videoEl || !_ctx) return;
        if (_videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

        // Check for motion
        const motion = _pixelDiff();
        if (motion < MOTION_THRESHOLD) {
            _stableCount++;
            if (_stableCount >= STABLE_FRAMES) _setFps(0.2);
        } else {
            _stableCount = 0;
            _setFps(1);
        }

        try {
            _ctx.drawImage(_videoEl, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);
            _encodeWithFallback(JPEG_QUALITY, (base64) => {
                if (!_running) return;
                _frameCount++;
                if (_onFrame) _onFrame(base64);
                if (_frameCount <= 2) console.log(`VideoCapture #${_frameCount}: ${(base64.length/1024).toFixed(1)}KB @ ${_currentFps}fps`);
            });
        } catch (err) { console.error('VideoCapture error:', err); }
    }

    function _encodeWithFallback(quality, callback) {
        _canvasEl.toBlob((blob) => {
            if (!blob) return;
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1] || '';
                if (base64.length > MAX_BASE64_BYTES && quality > MIN_QUALITY) {
                    _encodeWithFallback(quality - 0.1, callback);
                    return;
                }
                callback(base64);
            };
            reader.readAsDataURL(blob);
        }, 'image/jpeg', quality);
    }

    const self = {
        start, stop,
        get isRunning() { return _running; },
        get frameCount() { return _frameCount; },
        get currentFps() { return _currentFps; },
        set onFrame(fn) { _onFrame = fn; },
        set onFpsChange(fn) { _onFpsChange = fn; },
    };
    return self;
})();
