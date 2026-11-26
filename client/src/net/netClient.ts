// Authoritative WebSocket client with ~100ms remote interpolation buffer & rejoin token persistence

export interface RemoteSnapshotPlayer {
  id: string;
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  yaw: number;
  animState: string;
  carryingChest: boolean;
  knockedDownTimer: number;
}

interface BufferedFrame {
  time: number;
  players: Map<string, RemoteSnapshotPlayer>;
}

export class TreasureNetClient {
  public ws: WebSocket | null = null;
  public status: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  public playerId: string | null = null;
  public token: string | null = null;
  public room: any = null;

  private readonly handlers = new Map<string, (payload: any) => void>();
  private readonly snapshotBuffer: BufferedFrame[] = [];
  private readonly INTERP_DELAY_MS = 100;

  public on(event: string, fn: (payload: any) => void): void {
    this.handlers.set(event, fn);
  }

  private emit(event: string, payload: any): void {
    this.handlers.get(event)?.(payload);
  }

  public connect(wsUrl: string): Promise<void> {
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
          reject(new Error('Connection timed out. Is the Treasure Isle server running?'));
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
          reject(new Error('Could not reach WebSocket server.'));
        }
      };

      this.ws.onclose = () => {
        const wasConnected = this.status === 'connected';
        this.status = 'disconnected';
        this.emit('status', this.status);
        if (wasConnected) this.emit('disconnected', {});
      };

      this.ws.onmessage = (ev) => {
        let msg: any;
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
              'treasure_isle_session',
              JSON.stringify({ roomCode: msg.room.code, token: msg.token })
            );
          } catch {}
        } else if (msg.type === 'room_update') {
          this.room = msg.room;
        } else if (msg.type === 'snapshot') {
          const map = new Map<string, RemoteSnapshotPlayer>();
          for (const p of msg.players || []) map.set(p.id, p);
          this.snapshotBuffer.push({ time: performance.now(), players: map });
          while (this.snapshotBuffer.length > 15) this.snapshotBuffer.shift();
        }
        this.emit(msg.type, msg);
      };
    });
  }

  /** ~100ms entity interpolation for smooth remote pirate motion */
  public getInterpolatedPlayer(id: string): RemoteSnapshotPlayer | null {
    if (this.snapshotBuffer.length === 0) return null;
    const renderTime = performance.now() - this.INTERP_DELAY_MS;

    let older: BufferedFrame | null = null;
    let newer: BufferedFrame | null = null;
    for (let i = this.snapshotBuffer.length - 1; i >= 0; i--) {
      if (this.snapshotBuffer[i].time <= renderTime) {
        older = this.snapshotBuffer[i];
        newer = this.snapshotBuffer[i + 1] || older;
        break;
      }
    }
    if (!older) {
      return this.snapshotBuffer[0].players.get(id) || null;
    }

    const p0 = older.players.get(id);
    const p1 = newer?.players.get(id);
    if (!p0) return p1 || null;
    if (!p1 || older === newer) return p0;

    const span = Math.max(1, newer!.time - older.time);
    const t = Math.max(0, Math.min(1, (renderTime - older.time) / span));

    return {
      ...p1,
      pos: {
        x: p0.pos.x + (p1.pos.x - p0.pos.x) * t,
        y: p0.pos.y + (p1.pos.y - p0.pos.y) * t,
        z: p0.pos.z + (p1.pos.z - p0.pos.z) * t
      },
      yaw: p0.yaw + Math.atan2(Math.sin(p1.yaw - p0.yaw), Math.cos(p1.yaw - p0.yaw)) * t
    };
  }

  public send(msg: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public close(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.snapshotBuffer.length = 0;
    this.status = 'disconnected';
  }
}
