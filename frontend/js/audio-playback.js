/**
 * Audio playback pipeline — decodes base64 PCM16 24kHz audio from Qwen.
 */
const AudioPlayback = (() => {
    const QWEN_SAMPLE_RATE = 24000;

    let _audioCtx = null;
    let _pcmBuffer = new Int16Array(0);
    let _pendingSource = null;
    let _onPlayStart = null;
    let _onPlayEnd = null;

    function _ensureCtx() {
        if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        return _audioCtx;
    }

    /**
     * Add base64 PCM16 24kHz mono chunk.
     * Qwen outputs PCM16 (2 bytes/sample), not PCM24.
     */
    function addChunk(base64) {
        if (!base64) return;
        try {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

            // PCM16: 2 bytes/sample, little-endian signed
            const sampleCount = Math.floor(bytes.length / 2);
            const int16 = new Int16Array(sampleCount);
            const view = new DataView(bytes.buffer);
            for (let i = 0; i < sampleCount; i++) {
                int16[i] = view.getInt16(i * 2, true); // little-endian
            }

            const merged = new Int16Array(_pcmBuffer.length + int16.length);
            merged.set(_pcmBuffer);
            merged.set(int16, _pcmBuffer.length);
            _pcmBuffer = merged;
        } catch (e) { console.error('AudioPlayback decode error:', e); }
    }

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
