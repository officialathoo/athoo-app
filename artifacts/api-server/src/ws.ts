import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "http";
import jwt from "jsonwebtoken";
import { addSubscriber, removeSubscriber } from "./lib/eventBus";

const _wsJwtRaw = process.env["JWT_SECRET"] || process.env["SESSION_SECRET"];
if (!_wsJwtRaw) {
  throw new Error("FATAL: JWT_SECRET (or SESSION_SECRET) is required. WebSocket server cannot start without it.");
}
const JWT_SECRET: string = _wsJwtRaw;

const callRooms = new Map<string, Set<WebSocket>>();

type DecodedToken = { userId: string; role: string };

function decodeToken(token: string | null): DecodedToken | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    if (!decoded?.userId || !decoded?.role) return null;
    return { userId: decoded.userId, role: decoded.role };
  } catch {
    return null;
  }
}

export function setupWebSocket(server: Server) {
  const callsWss = new WebSocketServer({ noServer: true });
  const eventsWss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = req.url || "";
    const callMatch = url.match(/^(?:\/api)?\/ws\/calls\/([^/?]+)/);
    if (callMatch) {
      callsWss.handleUpgrade(req, socket as any, head, (ws) => {
        callsWss.emit("connection", ws, req);
      });
      return;
    }

    const eventsMatch = url.match(/^(?:\/api)?\/ws\/events(?:\?|$)/);
    if (eventsMatch) {
      eventsWss.handleUpgrade(req, socket as any, head, (ws) => {
        eventsWss.emit("connection", ws, req);
      });
      return;
    }

    socket.destroy();
  });

  callsWss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = req.url || "";
    const match = url.match(/^(?:\/api)?\/ws\/calls\/([^/?]+)/);
    if (!match) { ws.close(); return; }

    // Authenticate the caller before allowing access to the call room.
    const parsedUrl = new URL(url, "http://localhost");
    const token = parsedUrl.searchParams.get("token");
    const decoded = decodeToken(token);
    if (!decoded) {
      try {
        ws.send(JSON.stringify({ event: "auth:error", payload: { reason: "invalid_token" } }));
      } catch { /* ignore */ }
      ws.close(4401, "invalid_token");
      return;
    }

    const callId = match[1] as string;
    if (!callRooms.has(callId)) callRooms.set(callId, new Set());
    const room = callRooms.get(callId)!;
    room.add(ws);

    ws.on("message", (data: Buffer) => {
      for (const client of room) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(data, { binary: false });
        }
      }
    });

    ws.on("close", () => {
      room.delete(ws);
      if (room.size === 0) callRooms.delete(callId);
    });

    ws.on("error", () => {
      room.delete(ws);
    });
  });

  eventsWss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "", "http://localhost");
    const token = url.searchParams.get("token");
    const decoded = decodeToken(token);
    if (!decoded) {
      try {
        ws.send(JSON.stringify({ event: "auth:error", payload: { reason: "invalid_token" } }));
      } catch { /* ignore */ }
      ws.close(4401, "invalid_token");
      return;
    }

    const sub = { ws, userId: decoded.userId, role: decoded.role };
    addSubscriber(sub);

    try {
      ws.send(JSON.stringify({ event: "connected", payload: { userId: decoded.userId, role: decoded.role } }));
    } catch { /* ignore */ }

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.ping(); } catch { /* ignore */ }
      }
    }, 25000);

    ws.on("close", () => {
      clearInterval(ping);
      removeSubscriber(sub);
    });

    ws.on("error", () => {
      clearInterval(ping);
      removeSubscriber(sub);
    });
  });
}

