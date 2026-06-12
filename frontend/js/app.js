/**
 * AI Visual Dialogue Assistant — Main application.
 *
 * Orchestrates: UI, AudioCapture, VideoCapture, WsClient, AudioPlayback.
 */
const App = (() => {
    const State = { IDLE: 'idle', STARTING: 'starting', RUNNING: 'running', ERROR: 'error' };
    let _state = State.IDLE;
    let _mediaStream = null;
    let _ws = null;
    let _audioOut = null;
    let _muted = false;  // mute mic while AI is speaking (echo prevention)
    let _subtitleText = '';  // accumulated subtitle text

    // ── Media ───────────────────────────────────────────────────────
    async function requestMedia() {
        try {
            _mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
                audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
            });
            UI.refs.cameraPreview.srcObject = _mediaStream;
            UI.hidePermissionOverlay();
            return true;
        } catch (err) {
            console.error('getUserMedia error:', err);
            if (err.name === 'NotAllowedError')
                UI.addErrorMessage('摄像头/麦克风权限被拒绝，请在浏览器设置中允许访问。');
            else if (err.name === 'NotFoundError')
                UI.addErrorMessage('未检测到摄像头或麦克风设备。');
            else
                UI.addErrorMessage(`设备访问失败: ${err.message}`);
            return false;
        }
    }

    function stopMedia() {
        if (_mediaStream) {
            _mediaStream.getTracks().forEach(t => t.stop());
            _mediaStream = null;
        }
        UI.refs.cameraPreview.srcObject = null;
        UI.showPermissionOverlay();
    }

    // ── WebSocket event handler ─────────────────────────────────────
    function handleWsMessage(type, payload) {
        switch (type) {
        case 'status':
            UI.setStatus(payload.state);
            // Mute mic while AI is thinking/speaking to prevent echo loop
            if (payload.state === 'listening') {
                _muted = false;
            } else if (payload.state === 'speaking' || payload.state === 'thinking') {
                _muted = true;
            }
            break;
        case 'text_delta':
            UI.appendAiText(payload.text || '');
            if (UI.isSubtitleEnabled()) {
                _subtitleText += payload.text || '';
                UI.setSubtitle(_subtitleText);
            }
            break;
        case 'text_done':
            UI.finishAiBubble();
            _subtitleText = '';  // reset for next round
            break;
        case 'audio_delta':
            if (UI.isAudioEnabled()) {
                _audioOut.addChunk(payload.data || '');
            }
            break;
        case 'audio_done':
            // Auto-play already triggered; just ensure final flush
            if (UI.isAudioEnabled() && _audioOut.bufferLength > 0) {
                _audioOut.play();
            }
            break;
        case 'error':
            UI.addErrorMessage(payload.message || 'AI 服务错误');
            UI.setStatus('error');
            break;
        default:
            console.log('Unhandled WS message:', type, payload);
        }
    }

    // ── Start ───────────────────────────────────────────────────────
    async function start() {
        if (_state === State.RUNNING) return;
        _state = State.STARTING;
        UI.setStatus('connecting', '正在启动...');
        UI.setButtons(false, false);

        // 1. Request camera + mic
        const ok = await requestMedia();
        if (!ok) { _state = State.ERROR; UI.setStatus('error', '设备启动失败'); UI.setButtons(true, false); return; }

        // 2. Connect WebSocket
        _ws = new WsClient();
        _ws.onMessage = handleWsMessage;
        _ws.connect();

        // 3. Init audio playback
        _audioOut = AudioPlayback;

        // 4. Start audio capture
        await AudioCapture.start(_mediaStream);
        AudioCapture.onChunk = (base64) => {
            if (!_muted && _ws && _ws.isConnected) _ws.send({ type: 'audio', data: base64 });
        };
        AudioCapture.onLevel = (level) => UI.setMeterLevel(level);

        // 5. Start video capture
        VideoCapture.start(UI.refs.cameraPreview, UI.refs.captureCanvas);
        VideoCapture.onFrame = (base64) => {
            if (_ws && _ws.isConnected) _ws.send({ type: 'video', data: base64 });
        };

        // 6. Send session start (small delay to let WS connect)
        setTimeout(() => {
            if (_ws && _ws.isConnected) _ws.send({ type: 'start_session' });
        }, 500);

        _state = State.RUNNING;
        UI.setStatus('listening', '正在聆听...');
        UI.setButtons(false, true);
        UI.addSystemMessage('✅ 已连接，开始对话吧！');
    }

    // ── Stop ────────────────────────────────────────────────────────
    async function stop() {
        AudioCapture.stop();
        VideoCapture.stop();
        _audioOut.destroy();
        if (_ws) { _ws.send({ type: 'end_session' }); _ws.disconnect(); _ws = null; }
        stopMedia();
        _state = State.IDLE;
        UI.setStatus('idle', '等待连接');
        UI.setButtons(true, false);
        UI.clearSubtitle();
        _subtitleText = '';
        UI.addSystemMessage('对话已结束。');
    }

    // ── Init ────────────────────────────────────────────────────────
    function init() {
        UI.refs.btnStart.addEventListener('click', start);
        UI.refs.btnStop.addEventListener('click', stop);
        UI.setButtons(true, false);
        UI.setStatus('idle', '等待连接');

        UI.onAudioToggle(() => {
            UI.setCostHint(UI.isAudioEnabled()
                ? '语音播报开启（费用较高）'
                : '仅文字回复（省费模式）');
        });
        UI.setCostHint('语音播报开启（费用较高）');

        console.log('AI 视觉对话助手 — 前端已加载 🚀');
    }

    return { init, get state() { return _state; }, get mediaStream() { return _mediaStream; } };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
