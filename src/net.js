// Browser WebSocket client for private rooms, authoritative core/score sync, and rejoin tokens

export class NetClient {
  constructor() {
    this.ws = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error'
    this.playerId = null;
    this.token = null;
    this.room = null;
    this.handlers = new Map();
  }

  on(event, fn) {
    this.handlers.set(event, fn);
  }

  emit(event, payload) {
    const fn = this.handlers.get(event);
    if (fn) fn(payload);
  }

  connect(wsUrl) {
    return new Promise((resolve, reject) => {
      this.close();
      this.status = 'connecting';
      this.emit('status', this.status);

      let settled = false;
      try {
        this.ws = new WebSocket(wsUrl);
      } catch (err) {
        this.status = 'error';
        this.emit('status', this.status);
        reject(err);
        return;
      }

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.status = 'error';
          this.emit('status', this.status);
          this.ws?.close();
          reject(new Error('Connection timed out. Is the multiplayer server running?'));
        }
      }, 4500);

      this.ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.status = 'connected';
        this.emit('status', this.status);
        resolve();
      };

      this.ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          this.status = 'error';
          this.emit('status', this.status);
          reject(new Error('Could not reach multiplayer WebSocket server.'));
        }
      };

      this.ws.onclose = () => {
        const wasConnected = this.status === 'connected';
        this.status = 'disconnected';
        this.emit('status', this.status);
        if (wasConnected) {
          this.emit('disconnected', {});
        }
      };

      this.ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === 'joined_room') {
          this.playerId = msg.playerId;
          this.token = msg.token;
          this.room = msg.room;
          try {
            sessionStorage.setItem(
              'skyhook_session',
              JSON.stringify({ roomCode: msg.room.code, token: msg.token })
            );
          } catch {}
        } else if (msg.type === 'room_update') {
          this.room = msg.room;
        }
        this.emit(msg.type, msg);
      };
    });
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.status = 'disconnected';
  }
}
