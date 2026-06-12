/**
 * WebSocket client with auto-reconnect.
 *
 * Manages browser↔backend WebSocket connection with exponential backoff
 * reconnection, offline message queuing, and event dispatching.
 */
const WsClient = ((url) => {
    const RECONNECT_BASE_MS = 1000;
    const RECONNECT_MAX_MS = 30000;
    const RECONNECT_MAX_ATTEMPTS = 10;
    const QUEUE_MAX_SIZE = 200;

    let _ws = null;
    let _url = url || `ws://${location.host}/ws`;
    let _reconnectAttempts = 0;
    let _reconnectTimer = null;
    let _intentionalClose = false;
    let _messageQueue = [];
    let _onMessage = null;
    let _onStatusChange = null;

    function connect() {
        if (_ws && (_ws.readyState === WebSocket.OPEN ||
                    _ws.readyState === WebSocket.CONNECTING)) return;
        _intentionalClose = false;

        try { _ws = new WebSocket(_url); }
        catch (e) { console.error('WsClient: create failed', e); _scheduleReconnect(); return; }

        _ws.onopen = () => {
            console.log('WsClient: connected');
            _reconnectAttempts = 0;
            if (_onStatusChange) _onStatusChange('connected');
            _flushQueue();
        };

        _ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (_onMessage) _onMessage(msg.type || '', msg);
            } catch (e) { console.error('WsClient: parse error', e); }
        };

        _ws.onclose = (event) => {
            _ws = null;
            if (_onStatusChange) _onStatusChange('disconnected');
            if (!_intentionalClose) _scheduleReconnect();
        };

        _ws.onerror = () => {}; // onclose will fire after this
    }

    function disconnect() {
        _intentionalClose = true;
        if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
        if (_ws) { _ws.close(1000); _ws = null; }
    }

    function send(data) {
        const json = typeof data === 'string' ? data : JSON.stringify(data);
        if (_ws && _ws.readyState === WebSocket.OPEN) {
            _ws.send(json);
        } else {
            if (_messageQueue.length >= QUEUE_MAX_SIZE) _messageQueue.shift();
            _messageQueue.push(json);
        }
    }

    function _scheduleReconnect() {
        if (_reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) return;
        const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, _reconnectAttempts), RECONNECT_MAX_MS);
        _reconnectAttempts++;
        if (_onStatusChange) _onStatusChange('reconnecting');
        _reconnectTimer = setTimeout(() => connect(), delay);
    }

    function _flushQueue() {
        while (_messageQueue.length > 0 && _ws && _ws.readyState === WebSocket.OPEN) {
            _ws.send(_messageQueue.shift());
        }
    }

    return {
        connect, disconnect, send,
        set onMessage(fn) { _onMessage = fn; },
        set onStatusChange(fn) { _onStatusChange = fn; },
        get isConnected() { return _ws && _ws.readyState === WebSocket.OPEN; },
    };
});
