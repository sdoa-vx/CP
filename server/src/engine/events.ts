import { ServerResponse } from "node:http";

// ── Event shape ───────────────────────────────────────────────────────────────
export interface EngineEvent {
  id: number;
  type: string;
  time: string;
  message: string;
  payload: Record<string, unknown>;
}

// ── Internal state ────────────────────────────────────────────────────────────
const BUFFER_SIZE = 200;
let seq = 0;
const buffer: EngineEvent[] = [];
const sseClients = new Set<ServerResponse>();

// ── Formatting ────────────────────────────────────────────────────────────────
function formatMessage(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "engine:start":      return `Engine started (PID ${payload.pid}, port ${payload.port})`;
    case "engine:restart":    return "Engine restarted";
    case "scan:start":        return `Scan started: ${payload.root}`;
    case "scan:complete":     return `Scan complete — ${payload.filesScanned} files cached`;
    case "cache:cleared":     return "AST cache cleared";
    case "sync:start":        return `Sync started — ${payload.queued} items queued`;
    case "sync:flush":        return `Offline queue flushed (${payload.flushed} sent, ${payload.failed} failed)`;
    case "sync:error":        return `Sync error: ${payload.error}`;
    case "ast:cacheWarmed":   return `AST Cache Warmed (${payload.files} files)`;
    case "detector:hit":      return `${payload.detector} Detector triggered (${payload.matches} matches)`;
    case "detector:uiPrimitive": return `UI Primitive Detector triggered (${payload.matches} matches)`;
    case "detector:workflow": return `Workflow Detector triggered (${payload.matches} matches)`;
    case "detector:schema":   return `Schema Detector triggered (${payload.matches} matches)`;
    case "detector:token":    return `Token Detector triggered (${payload.matches} matches)`;
    case "detector:engine":   return `Engine Detector triggered (${payload.matches} matches)`;
    default:                  return type;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Emit an event — fans out to all connected SSE clients and logs to buffer */
export function emit(type: string, payload: Record<string, unknown> = {}) {
  const event: EngineEvent = {
    id: ++seq,
    type,
    time: new Date().toLocaleTimeString("en-US", { hour12: false }),
    message: formatMessage(type, payload),
    payload,
  };
  buffer.push(event);
  if (buffer.length > BUFFER_SIZE) buffer.shift();

  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) {
    try { res.write(data); }
    catch { sseClients.delete(res); }
  }
}

/** Get recent events from the rolling buffer */
export function getRecentEvents(n = 100): EngineEvent[] {
  return buffer.slice(-n);
}

/** Attach a response as an SSE client. Sends backlog then streams live. */
export function attachSseClient(res: ServerResponse) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.statusCode = 200;

  // Send current buffer as backlog
  for (const event of getRecentEvents(50)) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  sseClients.add(res);

  const hb = setInterval(() => {
    try { res.write(": heartbeat\n\n"); }
    catch { clearInterval(hb); sseClients.delete(res); }
  }, 15_000);

  res.on("close", () => {
    clearInterval(hb);
    sseClients.delete(res);
  });
}

// ── EventBus facade (callable from anywhere in the codebase) ──────────────────
export const eventBus = {
  emitEvent(type: string, payload: Record<string, unknown> = {}) {
    emit(type, payload);
  },
};
