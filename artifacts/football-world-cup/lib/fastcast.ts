import pako from 'pako';
import { fastcastTopic } from '@/lib/espn';

// ESPN "Fastcast" — the undocumented WebSocket that powers espn.com gamecasts.
// It PUSHES each update the instant ESPN publishes it, so we use it purely as an
// instant "something happened, refetch now" trigger on top of our REST snapshot
// (REST stays the source of truth — a mis-parsed delta can never corrupt the UI).
//
// Protocol (validated live): handshake → wss → {op:'C'} → server replies with a
// session id → subscribe {op:'S', tc:'gp-soccer-fifa.world-<eventId>'} → messages
// (op 'R'/'P') carry a nested payload {ts,'~c',pl} whose inner `pl` is
// base64+deflate → a JSON-Patch array over the gamecast entity tree.

const HANDSHAKE_URL = 'https://fastcast.semfs.engsvc.go.com/public/websockethost';
const ORIGIN = 'https://www.espn.com';

export interface FastcastHandle {
  close: () => void;
}

function b64ToBytes(b64: string): Uint8Array | null {
  try {
    // Hermes/RN provide a global atob; guard just in case.
    const bin: string = (globalThis as any).atob ? (globalThis as any).atob(b64) : '';
    if (!bin) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function inflateToJson(innerB64: string): string | null {
  const bytes = b64ToBytes(innerB64);
  if (!bytes) return null;
  try {
    return pako.inflate(bytes, { to: 'string' } as any) as unknown as string;
  } catch {
    try {
      return pako.inflateRaw(bytes, { to: 'string' } as any) as unknown as string;
    } catch {
      return null;
    }
  }
}

// A JSON-Patch delta is "significant" (worth an instant refetch) when it carries
// a goal, a score change, a status/period change, or a red card / penalty.
function isSignificant(patch: any[]): boolean {
  for (const op of patch) {
    if (!op || typeof op !== 'object') continue;
    const path: string = typeof op.path === 'string' ? op.path : '';
    const val = op.value;
    if (val && val.scoringPlay === true) return true;
    if (op.op === 'replace' && /\/score$/.test(path)) return true;
    if (path.includes('/status/type') || path.includes('/status/period')) return true;
    const slug: string = val?.type?.slug ?? '';
    if (/goal|red-card|penalty/.test(slug)) return true;
  }
  return false;
}

export function connectMatchFastcast(eventId: string, slug: string, onSignificant: () => void): FastcastHandle {
  const topic = fastcastTopic(slug, eventId);
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let backoff = 1000;

  const scheduleReconnect = () => {
    if (closed) return;
    try { ws?.close(); } catch { /* ignore */ }
    ws = null;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 15000);
  };

  async function connect() {
    if (closed) return;
    try {
      const res = await fetch(HANDSHAKE_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error(`handshake ${res.status}`);
      const hs = await res.json();
      const url = `wss://${hs.ip}:${hs.securePort}/FastcastService/pubsub/profiles/12000?TrafficManager-Token=${encodeURIComponent(hs.token)}`;
      // RN WebSocket accepts a 3rd options arg with headers (needed: Origin).
      const socket: WebSocket = new (WebSocket as any)(url, undefined, { headers: { Origin: ORIGIN } });
      ws = socket;

      socket.onopen = () => { try { socket.send(JSON.stringify({ op: 'C' })); } catch { /* ignore */ } };

      socket.onmessage = (ev: any) => {
        let m: any;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.op === 'C') {
          backoff = 1000;
          try { socket.send(JSON.stringify({ op: 'S', sid: m.sid, tc: topic })); } catch { /* ignore */ }
          return;
        }
        if ((m.op === 'R' || m.op === 'P') && m.pl && m.tc === topic) {
          try {
            const outer = JSON.parse(m.pl);
            const innerB64: string | undefined = outer?.pl;
            if (!innerB64) return;
            const json = inflateToJson(innerB64);
            if (!json) return;
            const patch = JSON.parse(json);
            if (Array.isArray(patch) && isSignificant(patch)) onSignificant();
          } catch { /* ignore malformed delta */ }
        }
      };

      socket.onerror = () => { /* handled by onclose */ };
      socket.onclose = () => { scheduleReconnect(); };
    } catch {
      scheduleReconnect();
    }
  }

  connect();

  return {
    close: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { ws?.close(); } catch { /* ignore */ }
      ws = null;
    },
  };
}
