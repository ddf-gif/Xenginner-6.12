/**
 * UI helpers — LENS design system.
 * Uses data-state attributes for styling, hidden attribute for visibility.
 */
const UI = (() => {
    const $ = s => document.querySelector(s);

    const refs = {
        landing:        $('#landing'),
        app:            $('#app'),
        btnEnter:       $('#btn-enter'),
        btnBack:        $('#btn-back'),

        cameraPreview:  $('#camera-preview'),
        cameraFrame:    $('#camera-frame'),
        cameraFloat:    $('#camera-float'),
        cameraDragHandle:$('#camera-drag-handle'),
        cameraResizeHandle:$('#camera-resize-handle'),
        btnResizeSm:    $('#btn-resize-sm'),
        btnResizeMd:    $('#btn-resize-md'),
        btnResizeLg:    $('#btn-resize-lg'),
        captureCanvas:  $('#capture-canvas'),
        placeholder:    $('#permission-overlay'),
        btnStart:       $('#btn-start'),
        btnCamera:      $('#btn-camera'),
        btnSwitchCam:   $('#btn-switch-cam'),
        btnStop:        $('#btn-stop'),

        statusDot:      $('#status-dot'),
        statusText:     $('#status-text'),

        chatMessages:   $('#chat-messages'),

        audioToggle:    $('#audio-toggle'),
        subtitleToggle: $('#subtitle-toggle'),

        meterBar:       $('#meter-bar'),
        subtitleText:   $('#subtitle-text'),
        costHint:       $('#cost-hint'),
        interruptBtn:   $('#btn-interrupt'),
        costDisplay:    $('#cost-display'),
        waveform:       $('#waveform'),
        particles:      $('#particles'),
        roleOptions:    $('#role-options'),
        quickAsks:      $('#quick-asks'),
        miniMascot:     $('#mini-mascot'),
    };

    let _aiBubble = null, _aiText = '', _typingEl = null, _welcomeEl = null;

    const OWL_SVG = '<svg viewBox="0 0 30 30" fill="none"><circle cx="15" cy="14" r="10" fill="oklch(0.25 0 0)" stroke="oklch(0.35 0 0)" stroke-width="1"/><circle cx="11" cy="12" r="3" fill="oklch(0.95 0 0)"/><circle cx="19" cy="12" r="3" fill="oklch(0.95 0 0)"/><circle cx="11.5" cy="12" r="1.3" fill="oklch(0.15 0 0)"/><circle cx="19.5" cy="12" r="1.3" fill="oklch(0.15 0 0)"/><ellipse cx="15" cy="19" rx="2.5" ry="1.5" fill="var(--primary)"/></svg>';

    // ── Pages ──────────────────────────────────────────────────────
    function showConversation() {
        refs.landing.setAttribute('hidden', '');
        refs.app.removeAttribute('hidden');
        refs.app.removeAttribute('inert');
    }
    function showLanding() {
        refs.app.setAttribute('hidden', '');
        refs.app.setAttribute('inert', '');
        refs.landing.removeAttribute('hidden');
    }

    // ── Status ─────────────────────────────────────────────────────
    function setStatus(state) {
        const map = {
            listening:'正在聆听', thinking:'正在思考', speaking:'正在回复',
            error:'连接错误', idle:'等待连接', connecting:'正在连接中'
        };
        refs.statusDot.setAttribute('data-state', state);
        refs.statusText.setAttribute('data-state', state);
        refs.statusText.textContent = map[state] || state;
        // Camera float glow
        ['speaking','thinking'].forEach(c=>refs.cameraFloat?.classList.remove(c));
        if(state==='speaking'||state==='thinking')refs.cameraFloat?.classList.add(state);
        // Mini mascot
        if (refs.miniMascot) {
            refs.miniMascot.className = 'mini-mascot ' + state;
        }
    }

    // ── Chat ───────────────────────────────────────────────────────
    function addSystemMessage(text) {
        const d = document.createElement('div');
        d.className = 'msg msg--system';
        d.innerHTML = `<p>${text}</p>`;
        refs.chatMessages.appendChild(d);
        scrollChat();
    }
    function startAiBubble() {
        removeTyping();
        removeWelcome();
        // Row: avatar + bubble
        const row = document.createElement('div');
        row.className = 'msg-row';
        const avatar = document.createElement('div');
        avatar.className = 'msg-avatar';
        avatar.innerHTML = OWL_SVG;
        _aiBubble = document.createElement('div');
        _aiBubble.className = 'msg msg--ai';
        _aiText = '';
        row.appendChild(avatar);
        row.appendChild(_aiBubble);
        refs.chatMessages.appendChild(row);
        scrollChat();
    }
    function appendAiText(delta) {
        if (!_aiBubble) startAiBubble();
        _aiText += delta;
        _aiBubble.innerHTML = `<p>${esc(_aiText)}</p>`;
        scrollChat();
    }
    function finishAiBubble() {
        if (_aiBubble) {
            const t = new Date();
            _aiBubble.innerHTML += `<span class="msg-time">${pad(t.getHours())}:${pad(t.getMinutes())}</span>`;
            _aiBubble = null; _aiText = '';
            scrollChat();
        }
    }

    // Typing indicator
    function showTyping() {
        removeWelcome();
        const row = document.createElement('div'); row.className = 'msg-row';
        const avatar = document.createElement('div'); avatar.className = 'msg-avatar'; avatar.innerHTML = OWL_SVG;
        const bubble = document.createElement('div'); bubble.className = 'msg msg--ai msg--typing';
        bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
        row.appendChild(avatar); row.appendChild(bubble);
        refs.chatMessages.appendChild(row); scrollChat();
        _typingEl = row;
    }
    function removeTyping() {
        if (_typingEl) { _typingEl.remove(); _typingEl = null; }
    }

    // Welcome card
    function showWelcome() {
        if (_welcomeEl) return;
        _welcomeEl = document.createElement('div');
        _welcomeEl.className = 'welcome-card';
        _welcomeEl.innerHTML = '<div class="welcome-card-icon">🦉</div><h3>AI 视觉对话助手已就绪</h3><p>直接说话或点击下方快捷提问开始交流</p>';
        refs.chatMessages.appendChild(_welcomeEl);
        scrollChat();
    }
    function removeWelcome() {
        if (_welcomeEl) { _welcomeEl.remove(); _welcomeEl = null; }
    }
    function addUserSpeech(text) {
        const d = document.createElement('div');
        d.className = 'msg msg--user';
        d.innerHTML = `<p>${esc(text)}</p>`;
        refs.chatMessages.appendChild(d);
        scrollChat();
    }
    function addErrorMessage(text) {
        const d = document.createElement('div');
        d.className = 'msg msg--system';
        d.style.color = 'var(--danger)';
        d.innerHTML = `<p>${text}</p>`;
        refs.chatMessages.appendChild(d);
        scrollChat();
    }
    function scrollChat() { refs.chatMessages.scrollTop = refs.chatMessages.scrollHeight; }

    // ── Audio meter ────────────────────────────────────────────────
    function setMeterLevel(l) { refs.meterBar.style.width = `${Math.min(l,1)*100}%`; }

    // ── Placeholder ────────────────────────────────────────────────
    function hidePlaceholder() { refs.placeholder?.setAttribute('hidden',''); }
    function showPlaceholder(msg) {
        if (refs.placeholder) {
            refs.placeholder.querySelector('p').textContent = msg || '点击下方按钮开始对话';
            refs.placeholder.removeAttribute('hidden');
        }
    }

    // ── Buttons ────────────────────────────────────────────────────
    function setButtons(start, stop) {
        refs.btnStart.disabled = !start;
        refs.btnStop.disabled = !stop;
    }

    // ── Toggles ────────────────────────────────────────────────────
    function isAudioEnabled() { return refs.audioToggle.checked; }
    function isSubtitleEnabled() { return refs.subtitleToggle.checked; }
    function onAudioToggle(fn) { refs.audioToggle.addEventListener('change', fn); }

    // ── Subtitle ───────────────────────────────────────────────────
    function setSubtitle(t) { refs.subtitleText.textContent = t || ''; }
    function clearSubtitle() { refs.subtitleText.textContent = ''; }

    // ── Cost ───────────────────────────────────────────────────────
    function setCostHint(t) { refs.costHint.textContent = t; }
    function showInterrupt(show) {
        if (!refs.interruptBtn) return;
        if (show) refs.interruptBtn.removeAttribute('hidden');
        else refs.interruptBtn.setAttribute('hidden','');
    }
    function setCostDisplay(text) { refs.costDisplay.textContent = text || ''; }

    // ── Helpers ────────────────────────────────────────────────────
    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function pad(n) { return String(n).padStart(2,'0'); }

    return {
        refs,
        showConversation, showLanding,
        setStatus, addSystemMessage, startAiBubble, appendAiText, finishAiBubble,
        addUserSpeech, addErrorMessage, setMeterLevel, hidePlaceholder, showPlaceholder,
        showTyping, removeTyping, showWelcome, removeWelcome,
        setButtons, isAudioEnabled, isSubtitleEnabled, onAudioToggle,
        setSubtitle, clearSubtitle, setCostHint, showInterrupt, setCostDisplay,
    };
})();
