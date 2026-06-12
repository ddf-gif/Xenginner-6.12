/**
 * AI Visual Dialogue Assistant — Main application entry.
 *
 * Handles:
 * - Camera & microphone permission via getUserMedia
 * - Application state machine
 * - Module orchestration (audio, video, WS, UI)
 */
const App = (() => {
    // ── State ──────────────────────────────────────────────────────
    const State = {
        IDLE: 'idle',
        STARTING: 'starting',
        RUNNING: 'running',
        ERROR: 'error',
    };

    let _state = State.IDLE;
    let _mediaStream = null;

    // ── Camera + Microphone initialization ─────────────────────────
    async function requestMedia() {
        try {
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user',
                },
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            };

            _mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

            // Show camera preview
            UI.refs.cameraPreview.srcObject = _mediaStream;
            UI.hidePermissionOverlay();

            return true;
        } catch (err) {
            console.error('getUserMedia error:', err);

            if (err.name === 'NotAllowedError') {
                UI.addErrorMessage('摄像头/麦克风权限被拒绝，请在浏览器设置中允许访问。');
            } else if (err.name === 'NotFoundError') {
                UI.addErrorMessage('未检测到摄像头或麦克风设备。');
            } else {
                UI.addErrorMessage(`设备访问失败: ${err.message}`);
            }
            return false;
        }
    }

    function stopMedia() {
        if (_mediaStream) {
            _mediaStream.getTracks().forEach(track => track.stop());
            _mediaStream = null;
        }
        UI.refs.cameraPreview.srcObject = null;
        UI.showPermissionOverlay();
    }

    // ── Start / Stop ───────────────────────────────────────────────
    async function start() {
        if (_state === State.RUNNING) return;
        _state = State.STARTING;
        UI.setStatus('connecting', '正在启动...');
        UI.setButtons(false, false);

        const ok = await requestMedia();
        if (!ok) {
            _state = State.ERROR;
            UI.setStatus('error', '设备启动失败');
            UI.setButtons(true, false);
            return;
        }

        // Check WebSocket support
        if (!window.WebSocket) {
            UI.addErrorMessage('您的浏览器不支持 WebSocket');
            _state = State.ERROR;
            UI.setStatus('error');
            UI.setButtons(true, false);
            return;
        }

        _state = State.RUNNING;
        UI.setStatus('idle', '就绪 — 已在监听');
        UI.setButtons(false, true);
        UI.addSystemMessage('摄像头与麦克风已就绪。WebSocket 集成将在后续 PR 中完成。');
    }

    async function stop() {
        stopMedia();
        _state = State.IDLE;
        UI.setStatus('idle', '等待连接');
        UI.setButtons(true, false);
    }

    // ── Init ────────────────────────────────────────────────────────
    function init() {
        UI.refs.btnStart.addEventListener('click', start);
        UI.refs.btnStop.addEventListener('click', stop);
        UI.setButtons(true, false);
        UI.setStatus('idle', '等待连接');

        // Audio toggle hint
        UI.onAudioToggle(() => {
            if (UI.isAudioEnabled()) {
                UI.setCostHint('语音播报开启（费用较高）');
            } else {
                UI.setCostHint('仅文字回复（省费模式）');
            }
        });
        UI.setCostHint('语音播报开启（费用较高）');

        console.log('AI 视觉对话助手 — 前端已加载');
    }

    // ── Public API ─────────────────────────────────────────────────
    return {
        init,
        get state() { return _state; },
        get mediaStream() { return _mediaStream; },
    };
})();

// ── Bootstrap ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
