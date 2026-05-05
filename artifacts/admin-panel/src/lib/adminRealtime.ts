import { getApiBase, getToken } from "./api";

type RealtimeMsg = { type: string; payload: Record<string, unknown> };
type Listener = (msg: RealtimeMsg) => void;

let ws: WebSocket | null = null;
let shouldReconnect = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function buildUrl(): string {
  const base = getApiBase().replace(/^http/, "ws");
  const token = getToken();
  return `${base}/api/ws/events?token=${encodeURIComponent(token)}`;
}

function openSocket(): void {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;

  try {
    ws = new WebSocket(buildUrl());

    ws.onmessage = (e) => {
      try {
        const raw = JSON.parse(e.data as string);
        const msg: RealtimeMsg = { type: raw.event ?? raw.type ?? "", payload: raw.payload ?? raw };
        listeners.forEach((fn) => fn(msg));
      } catch { /* ignore malformed frames */ }
    };

    ws.onclose = () => {
      ws = null;
      if (shouldReconnect) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(openSocket, 3000);
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  } catch { /* ignore if WS not available */ }
}

export const adminRealtime = {
  connect(): void {
    shouldReconnect = true;
    openSocket();
  },
  disconnect(): void {
    shouldReconnect = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    ws?.close();
    ws = null;
  },
  on(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
