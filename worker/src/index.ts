// worker/src/index.ts
export { World } from './world';

export interface Env { WORLD: DurableObjectNamespace }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/health') return new Response('ok', { headers: CORS });
    if (url.pathname === '/ws') {
      // one global room: a fixed name maps to a single DO instance for everyone, everywhere.
      const id = env.WORLD.idFromName('global');
      return env.WORLD.get(id).fetch(req);
    }
    return new Response('wanderlost-realtime', { status: 200, headers: CORS });
  },
};
