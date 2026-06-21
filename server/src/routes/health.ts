import { IncomingMessage, ServerResponse } from "http";

export function handleHealth(req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(getSystemMetrics()));
}

export function getSystemMetrics() {
  return {
    status: "ok",
    version: "1.0.3",
    memory: process.memoryUsage(),
    uptime: process.uptime()
  };
}
