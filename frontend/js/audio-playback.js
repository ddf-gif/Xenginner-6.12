/**
 * Audio playback pipeline.
 *
 * Decodes base64 PCM24 24kHz audio from Qwen, resamples to the
 * AudioContext sample rate, and plays through the default output device.
 */
const AudioPlayback = (() => {
    const QWEN_SAMPLE_RATE = 24000;
    const AUTO_PLAY_SAMPLES = 12000; // ~0.5s at 24kHz — auto-play threshold

    let _audioCtx = null;
    let _pcmBuffer = new Int16Array(0);
    let _pendingSource = null; // currently playing source
    let _onPlayStart = null;
    let _onPlayEnd = null;

    function _ensureCtx() {
        if (!_audioCtx) {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        return _audioCtx;
    }

    /** Decode base64 PCM24 → Int16 and add to buffer. */
    function addChunk(base64) {
        if (!base64) return;
        try {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

            const sampleCount = Math.floor(bytes.length / 3);
            const int16 = new Int16Array(sampleCount);
            for (let i = 0; i < sampleCount; i++) {
                let sample = bytes[i*3] | (bytes[i*3+1] << 8) | (bytes[i*3+2] << 16);
                if (sample & 0x800000) sample |= ~0xFFFFFF;
                int16[i] = sample >> 8;
            }

            const merged = new Int16Array(_pcmBuffer.length + int16.length);
            merged.set(_pcmBuffer);
            merged.set(int16, _pcmBuffer.length);
            _pcmBuffer = merged;

            // Auto-play when enough audio buffered
            if (_pcmBuffer.length >= AUTO_PLAY_SAMPLES && !_pendingSource) {
                _playInternal();
            }
        } catch (e) { console.error('AudioPlayback decode error:', e); }
    }

    /** Manually trigger playback of all accumulated audio. */
    function play() {
        if (_pcmBuffer.length === 0) return;
        _playInternal();
    }

    function _playInternal() {
        const ctx = _ensureCtx();
        const ratio = ctx.sampleRate / QWEN_SAMPLE_RATE;
        const dstLen = Math.floor(_pcmBuffer.length * ratio);
        const float32 = new Float32Array(dstLen);

        for (let i = 0; i < dstLen; i++) {
            const srcIdx = i / ratio;
            const lo = Math.floor(srcIdx);
            const hi = Math.min(lo + 1, _pcmBuffer.length - 1);
            const frac = srcIdx - lo;
            float32[i] = (_pcmBuffer[lo] + (_pcmBuffer[hi] - _pcmBuffer[lo]) * frac) / 32768;
        }

        const audioBuffer = ctx.createBuffer(1, float32.length, ctx.sampleRate);
        audioBuffer.getChannelData(0).set(float32);

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        if (_onPlayStart) _onPlayStart();
        _pendingSource = source;
        source.onended = () => {
            _pendingSource = null;
            if (_onPlayEnd) _onPlayEnd();
            // If more audio arrived during playback, play it
            if (_pcmBuffer.length >= AUTO_PLAY_SAMPLES) _playInternal();
        };
        source.start();
        _pcmBuffer = new Int16Array(0);
    }

    function clear() { _pcmBuffer = new Int16Array(0); _pendingSource = null; }
    function destroy() { clear(); if (_audioCtx) { _audioCtx.close().catch(() => {}); _audioCtx = null; } }

    return {
        addChunk, play, clear, destroy,
        set onPlayStart(fn) { _onPlayStart = fn; },
        set onPlayEnd(fn) { _onPlayEnd = fn; },
        get bufferLength() { return _pcmBuffer.length; },
    };
})();
