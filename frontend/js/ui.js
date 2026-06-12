/**
 * UI helpers — DOM references and update functions.
 * Provides a clean API for other modules to update the UI.
 */
const UI = (() => {
    // ── DOM refs ───────────────────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);

    const refs = {
        cameraPreview:  $('#camera-preview'),
        captureCanvas:  $('#capture-canvas'),
        permissionOverlay: $('#permission-overlay'),
        btnStart:       $('#btn-start'),
        btnStop:        $('#btn-stop'),
        statusDot:      $('#status-dot'),
        statusText:     $('#status-text'),
        chatMessages:   $('#chat-messages'),
        audioToggle:    $('#audio-toggle'),
        costHint:       $('#cost-hint'),
        meterBar:       $('#meter-bar'),
    };

    // Current streaming AI message element (for text delta accumulation)
    let _currentAiBubble = null;
    let _currentTextContent = '';

    // ── Status ─────────────────────────────────────────────────────
    const statusClasses = ['listening', 'thinking', 'speaking', 'error', 'idle'];

    function setStatus(state, text = '') {
        const dot = refs.statusDot;
        statusClasses.forEach(c => dot.classList.remove(c));
        dot.classList.add(state);
        refs.statusText.textContent = text || stateText(state);
    }

    function stateText(state) {
        const map = {
            listening: '正在聆听...',
            thinking: '正在思考...',
            speaking: '正在回复...',
            error: '连接错误',
            idle: '就绪',
            connecting: '正在连接...',
        };
        return map[state] || state;
    }

    // ── Chat ───────────────────────────────────────────────────────
    function addSystemMessage(text) {
        const div = document.createElement('div');
        div.className = 'message system';
        div.innerHTML = `<p>${text}</p>`;
        refs.chatMessages.appendChild(div);
        scrollToBottom();
    }

    function startAiBubble() {
        _currentAiBubble = document.createElement('div');
        _currentAiBubble.className = 'message ai';
        _currentTextContent = '';
        refs.chatMessages.appendChild(_currentAiBubble);
        scrollToBottom();
    }

    function appendAiText(delta) {
        if (!_currentAiBubble) startAiBubble();
        _currentTextContent += delta;
        _currentAiBubble.innerHTML = `<p>${escapeHtml(_currentTextContent)}</p>`;
        scrollToBottom();
    }

    function finishAiBubble() {
        if (_currentAiBubble) {
            const now = new Date();
            const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
            _currentAiBubble.innerHTML += `<div class="msg-time">${time}</div>`;
            _currentAiBubble = null;
            _currentTextContent = '';
            scrollToBottom();
        }
    }

    function addErrorMessage(text) {
        const div = document.createElement('div');
        div.className = 'message system';
        div.style.color = 'var(--danger)';
        div.innerHTML = `<p>⚠ ${text}</p>`;
        refs.chatMessages.appendChild(div);
        scrollToBottom();
    }

    function scrollToBottom() {
        refs.chatMessages.scrollTop = refs.chatMessages.scrollHeight;
    }

    // ── Audio meter ────────────────────────────────────────────────
    function setMeterLevel(level) {
        // level: 0.0 - 1.0
        refs.meterBar.style.width = `${Math.min(level, 1) * 100}%`;
    }

    // ── Permission overlay ─────────────────────────────────────────
    function hidePermissionOverlay() {
        refs.permissionOverlay.classList.add('hidden');
    }
    function showPermissionOverlay(msg) {
        refs.permissionOverlay.querySelector('p').textContent =
            msg || '点击「开始对话」授权摄像头与麦克风';
        refs.permissionOverlay.classList.remove('hidden');
    }

    // ── Buttons ────────────────────────────────────────────────────
    function setButtons(startEnabled, stopEnabled) {
        refs.btnStart.disabled = !startEnabled;
        refs.btnStop.disabled = !stopEnabled;
    }

    // ── Audio toggle ───────────────────────────────────────────────
    function isAudioEnabled() {
        return refs.audioToggle.checked;
    }
    function onAudioToggle(fn) {
        refs.audioToggle.addEventListener('change', fn);
    }
    function setCostHint(text) {
        refs.costHint.textContent = text;
    }

    // ── Helpers ────────────────────────────────────────────────────
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    function pad(n) { return String(n).padStart(2, '0'); }

    // ── Public API ─────────────────────────────────────────────────
    return {
        refs,
        setStatus,
        addSystemMessage,
        startAiBubble,
        appendAiText,
        finishAiBubble,
        addErrorMessage,
        setMeterLevel,
        hidePermissionOverlay,
        showPermissionOverlay,
        setButtons,
        isAudioEnabled,
        onAudioToggle,
        setCostHint,
        scrollToBottom,
    };
})();
