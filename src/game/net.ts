// src/game/net.ts
// WebSocket client. The client is authoritative over its OWN position (prediction, no rollback
// needed for a walking sim); the server is authoritative over reveal/open so finds are global and
// first-come-wins. The shared `seed` from `welcome` overrides the local default.

export function tileKey(tx: number, ty: number): string { return `${tx},${ty}`; }

export interface PeerInit { id: string; char: string; name: string; x: number; y: number; }

export interface NetCallbacks {
  onWelcome(seed: number, selfId: string): void;
  onPeerJoin(p: PeerInit): void;
  onPeerLeave(id: string): void;
  onPeerMove(id: string, x: number, y: number, dir: number, moving: boolean): void;
  onPeerIdentity(id: string, char: string, name: string): void;
  onReveal(key: string, kind: string, specimen: number | undefined, by: string): void;
  onOpen(key: string, taken: boolean, by: string): void;
}

const WS_URL = (import.meta as any).env?.VITE_WS_URL ?? '';

export class Net {
  private ws: WebSocket | null = null;
  private backoff = 500;
  private joinInfo: { char: string; name: string; x: number; y: number } | null = null;
  private queue: string[] = [];
  selfId = '';
  connected = false;
  enabled = !!WS_URL;

  constructor(private cb: NetCallbacks) {}

  connect(join: { char: string; name: string; x: number; y: number }): void {
    if (!this.enabled) return; // offline-friendly: no WS URL -> singleplayer
    this.joinInfo = join;
    this.openSocket();
  }

  private openSocket(): void {
    let ws: WebSocket;
    try { ws = new WebSocket(WS_URL); } catch { this.scheduleReconnect(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true; this.backoff = 500;
      if (this.joinInfo) this.send({ t: 'join', ...this.joinInfo });
      for (const q of this.queue) ws.send(q);
      this.queue = [];
    };
    ws.onmessage = ev => { try { this.handle(JSON.parse(ev.data)); } catch { /* ignore bad frame */ } };
    ws.onclose = () => { this.connected = false; this.scheduleReconnect(); };
    ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
  }

  private scheduleReconnect(): void {
    setTimeout(() => this.openSocket(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, 8000);
  }

  private handle(m: any): void {
    switch (m.t) {
      case 'welcome':
        this.selfId = m.id;
        this.cb.onWelcome(m.seed, m.id);
        for (const p of m.peers ?? []) this.cb.onPeerJoin(p);
        for (const r of m.reveals ?? []) this.cb.onReveal(r.key, r.kind, r.specimen, r.by ?? '');
        for (const k of m.opens ?? []) this.cb.onOpen(k, true, '');
        break;
      case 'presence':
        if (m.join) this.cb.onPeerJoin(m.join);
        if (m.leave) this.cb.onPeerLeave(m.leave);
        break;
      case 'move': this.cb.onPeerMove(m.id, m.x, m.y, m.dir, m.moving); break;
      case 'identity': this.cb.onPeerIdentity(m.id, m.char, m.name); break;
      case 'reveal': this.cb.onReveal(m.key, m.kind, m.specimen, m.by ?? ''); break;
      case 'open': this.cb.onOpen(m.key, !!m.taken, m.by ?? ''); break;
      case 'pong': break;
    }
  }

  private send(obj: unknown): void {
    if (!this.enabled) return;
    const s = JSON.stringify(obj);
    if (this.ws && this.connected) this.ws.send(s);
    else this.queue.push(s);
  }

  move(x: number, y: number, dir: number, moving: boolean) { this.send({ t: 'move', x, y, dir, moving }); }
  identity(char: string, name: string) {
    if (this.joinInfo) { this.joinInfo.char = char; this.joinInfo.name = name; }
    this.send({ t: 'identity', char, name });
  }
  reveal(key: string, kind: string, specimen?: number) { this.send({ t: 'reveal', key, kind, specimen }); }
  open(key: string) { this.send({ t: 'open', key }); }
}
