export class WSClient {
    constructor(roomId, onMessageCallback) {
        this.roomId = roomId;
        this.onMessage = onMessageCallback;
        this.ws = null;
        this.connect();
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        this.ws = new WebSocket(`${protocol}//${host}/api/collab-board/ws/${this.roomId}`);

        this.ws.onopen = () => {
            const status = document.getElementById('room-status');
            if (status) {
                status.innerHTML = '<span class="status-dot"></span> <span class="status-text">Conectado</span>';
                status.className = 'status-pill online';
            }
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (this.onMessage) this.onMessage(data);
            } catch (e) {
                console.error("WS JSON parse error", e);
            }
        };

        this.ws.onclose = () => {
            const status = document.getElementById('room-status');
            if (status) {
                status.innerHTML = '<span class="status-dot"></span> <span class="status-text">Reconectando...</span>';
                status.className = 'status-pill offline';
            }
            setTimeout(() => this.connect(), 3000);
        };
    }

    send(type, payload) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, room_id: this.roomId, data: payload }));
        }
    }
}
