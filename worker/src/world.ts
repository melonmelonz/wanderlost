// worker/src/world.ts
// The single global world. Presence is in-memory (per-connection attachment); reveal/open state
// is persisted in DO storage so it survives hibernation and is global / first-come-wins.
interface PeerMeta { id: string; char: string; name: string; x: number; y: number; }

type ClientMsg =
  | { t: 'join'; char: string; name: string; x: number; y: number }
  | { t: 'move'; x: number; y: number; dir: number; moving: boolean }
  | { t: 'identity'; char: string; name: string }
  | { t: 'reveal'; key: string; kind: string; specimen?: number }
  | { t: 'open'; key: string }
  | { t: 'ping'; ts: number };

const SEED_KEY = 'worldSeed';

export class World {
  state: DurableObjectState;
  seed = 0;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      let s = await this.state.storage.get<number>(SEED_KEY);
      if (s === undefined) { s = (Math.random() * 2 ** 31) | 0; await this.state.storage.put(SEED_KEY, s); }
      this.seed = s;
    });
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private peers(): WebSocket[] { return this.state.getWebSockets(); }
  private meta(ws: WebSocket): PeerMeta | null { return (ws.deserializeAttachment() as PeerMeta) ?? null; }
  private broadcast(obj: unknown, except?: WebSocket): void {
    const s = JSON.stringify(obj);
    for (const ws of this.peers()) if (ws !== except) { try { ws.send(s); } catch { /* gone */ } }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;
    let m: ClientMsg;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'ping') { ws.send(JSON.stringify({ t: 'pong', ts: m.ts })); return; }

    if (m.t === 'join') {
      const id = crypto.randomUUID().slice(0, 8);
      const meta: PeerMeta = { id, char: m.char, name: m.name, x: m.x, y: m.y };
      ws.serializeAttachment(meta);
      const present = this.peers().filter(p => p !== ws).map(p => this.meta(p)).filter(Boolean);
      const reveals = await this.state.storage.list<{ kind: string; specimen?: number }>({ prefix: 'r:' });
      const opens = await this.state.storage.list<true>({ prefix: 'o:' });
      ws.send(JSON.stringify({
        t: 'welcome', id, seed: this.seed, peers: present,
        reveals: [...reveals].map(([k, v]) => ({ key: k.slice(2), ...v })),
        opens: [...opens].map(([k]) => k.slice(2)),
      }));
      this.broadcast({ t: 'presence', join: meta }, ws);
      return;
    }

    const meta = this.meta(ws);
    if (!meta) return; // must join first

    if (m.t === 'move') {
      meta.x = m.x; meta.y = m.y; ws.serializeAttachment(meta);
      this.broadcast({ t: 'move', id: meta.id, x: m.x, y: m.y, dir: m.dir, moving: m.moving }, ws);
      return;
    }

    if (m.t === 'identity') {
      meta.char = m.char; meta.name = m.name; ws.serializeAttachment(meta);
      this.broadcast({ t: 'identity', id: meta.id, char: m.char, name: m.name }, ws);
      return;
    }

    if (m.t === 'reveal') {
      const sk = 'r:' + m.key;
      if (await this.state.storage.get(sk)) return; // first-to-reveal wins
      const val = { kind: m.kind, specimen: m.specimen };
      await this.state.storage.put(sk, val);
      this.broadcast({ t: 'reveal', key: m.key, kind: m.kind, specimen: m.specimen, by: meta.id });
      return;
    }

    if (m.t === 'open') {
      const ok = 'o:' + m.key;
      if (await this.state.storage.get(ok)) { ws.send(JSON.stringify({ t: 'open', key: m.key, by: '', taken: true })); return; }
      await this.state.storage.put(ok, true);
      this.broadcast({ t: 'open', key: m.key, by: meta.id });
      return;
    }
  }

  webSocketClose(ws: WebSocket): void {
    const meta = this.meta(ws);
    if (meta) this.broadcast({ t: 'presence', leave: meta.id }, ws);
    try { ws.close(); } catch { /* already closed */ }
  }
  webSocketError(ws: WebSocket): void { this.webSocketClose(ws); }
}
