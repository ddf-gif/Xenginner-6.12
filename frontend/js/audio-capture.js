/**
 * Audio capture pipeline.
 *
 * Captures microphone audio via Web Audio API, converts to
 * PCM16 16kHz mono, buffers into 100ms chunks, and emits
 * base64-encoded chunks via callbacks.
 *
 * Usage:
 *   const ac = AudioCapture();
 *   ac.onChunk = (base64data) => { /* send via WS */ };
 *   await ac.start(mediaStream);
 *   ac.stop();
 */

const AudioCapture = (() => {
    // ── Constants ──────────────────────────────────────────────────
    const SAMPLE_RATE = 16000;      // Qwen requires 16 kHz
    const CHUNK_MS = 100;           // 100 ms per chunk
    const SAMPLES_PER_CHUNK = (SAMPLE_RATE * CHUNK_MS) / 1000; // 1600
    const BYTES_PER_CHUNK = SAMPLES_PER_CHUNK * 2; // 3200 (16-bit = 2 bytes)

    // ── Internal state ────────────────────────────────────────────
    let _audioCtx = null;
    let _source = null;
    let _processor = null;
    let _stream = null;
    let _buffer = new Int16Array(0);
    let _onChunk = null;
    let _onLevel = null;
    let _running = false;

    // ── Public API ─────────────────────────────────────────────────
    /**
     * Start capturing from the given MediaStream.
     * @param {MediaStream} stream - from getUserMedia({audio:true})
     */
    async function start(stream) {
        if (_running) return;
        _stream = stream;

        try {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: SAMPLE_RATE,
            });
        } catch (e) {
            console.error('AudioContext 创建失败:', e);
            return false;
        }

        // Create source from mic track
        _source = _audioCtx.createMediaStreamSource(stream);

        // Use ScriptProcessorNode for PCM extraction
        // (AudioWorklet is preferred but ScriptProcessor is simpler and broadly supported)
        const bufferSize = 4096; // must be power of 2
        _processor = _audioCtx.createScriptProcessor(bufferSize, 1, 1);

        _processor.onaudioprocess = _onAudioProcess;

        // Connect: source → processor → destination (needed to keep processing)
        _source.connect(_processor);
        _processor.connect(_audioCtx.destination);

        _running = true;
        console.log(`AudioCapture started: ${SAMPLE_RATE}Hz, ${CHUNK_MS}ms chunks`);
        return true;
    }

    function stop() {
        _running = false;

        if (_processor) {
            _processor.disconnect();
            _processor.onaudioprocess = null;
            _processor = null;
        }
        if (_source) {
            _source.disconnect();
            _source = null;
        }
        if (_audioCtx) {
            _audioCtx.close().catch(() => {});
            _audioCtx = null;
        }
        _stream = null;
        _buffer = new Int16Array(0);

        console.log('AudioCapture stopped');
    }

    // ── Callback setters ──────────────────────────────────────────
    Object.defineProperty(self, 'onChunk', {
        set(fn) { _onChunk = fn; },
        get() { return _onChunk; },
    });

    Object.defineProperty(self, 'onLevel', {
        set(fn) { _onLevel = fn; },
        get() { return _onLevel; },
    });

    // ── Internal: audio processing ─────────────────────────────────
    function _onAudioProcess(event) {
        if (!_running) return;

        const inputBuffer = event.inputBuffer;
        const channelData = inputBuffer.getChannelData(0); // Float32Array [-1, 1]

        // Convert Float32 → Int16
        const int16Data = new Int16Array(channelData.length);
        for (let i = 0; i < channelData.length; i++) {
            const sample = Math.max(-1, Math.min(1, channelData[i]));
            int16Data[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }

        // Calculate level for VU meter
        if (_onLevel) {
            let sum = 0;
            for (let i = 0; i < channelData.length; i++) {
                sum += Math.abs(channelData[i]);
            }
            const avgLevel = sum / channelData.length;
            _onLevel(avgLevel);
        }

        // Append to buffer
        const newBuffer = new Int16Array(_buffer.length + int16Data.length);
        newBuffer.set(_buffer);
        newBuffer.set(int16Data, _buffer.length);
        _buffer = newBuffer;

        // Emit complete 100ms chunks
        while (_buffer.length >= SAMPLES_PER_CHUNK) {
            const chunk = _buffer.slice(0, SAMPLES_PER_CHUNK);
            _buffer = _buffer.slice(SAMPLES_PER_CHUNK);

            if (_onChunk) {
                const base64 = _int16ToBase64(chunk);
                _onChunk(base64);
            }
        }
    }

    // ── Helpers ────────────────────────────────────────────────────
    function _int16ToBase64(int16Array) {
        const bytes = new Uint8Array(int16Array.buffer);
        let binary = '';
        const len = bytes.length;
        // Build base64 string in chunks to avoid stack overflow
        for (let i = 0; i < len; i += 4096) {
            const slice = bytes.subarray(i, Math.min(i + 4096, len));
            binary += String.fromCharCode.apply(null, slice);
        }
        return btoa(binary);
    }

    function _base64ToInt16(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Int16Array(bytes.buffer);
    }

    // ── Getters ────────────────────────────────────────────────────
    function isRunning() { return _running; }
    function chunkSize() { return BYTES_PER_CHUNK; }

    // ── Module object ──────────────────────────────────────────────
    const self = {
        start,
        stop,
        get isRunning() { return isRunning(); },
        get chunkSize() { return chunkSize(); },
        set onChunk(fn) { _onChunk = fn; },
        get onChunk() { return _onChunk; },
        set onLevel(fn) { _onLevel = fn; },
        get onLevel() { return _onLevel; },
    };

    return self;
})();
