import { WebSocketServer, WebSocket } from "ws";
import { Server } from "node:http";
import { logger } from "./utils/logger";

let wss: WebSocketServer | null = null;

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: "/dashboard/ws" });

  wss.on("connection", (ws: WebSocket) => {
    logger.info("Dashboard WebSocket client connected");
    ws.on("error", console.error);
  });
}

export function broadcastDashboardUpdate(type: string, payload: any) {
  if (!wss) return;
  const message = JSON.stringify({ type, payload });
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
