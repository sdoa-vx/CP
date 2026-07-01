import { db } from "../fisp/database";
import { scheduleFlush } from "../workers/offlineSync";

const CHRONICLE_INGEST_URL = "http://127.0.0.1:8081/chronicle/ingest";
const REQUEST_TIMEOUT_MS = 1500;

/**
 * Mirrors a durable scan milestone (scan:start/scan:complete/scan:error, or a
 * scan:progress_snapshot taken while SSE is down) to the Chronicle daemon.
 * Never throws — on failure the event is buffered in offline_queue and
 * retried by the existing offlineSync loop (see offlineSync.ts's 'CHRONICLE' case).
 */
export async function mirrorToChronicle(eventType: string, payload: Record<string, unknown>): Promise<void> {
  const envelope = {
    module_id: "dashboard-scanner",
    event_type: eventType,
    timestamp: new Date().toISOString(),
    payload
  };

  try {
    const res = await fetch(CHRONICLE_INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`Chronicle ingest returned ${res.status}`);
  } catch (err) {
    console.error(`[Chronicle] Failed to mirror ${eventType}, buffering for retry:`, err);
    db.prepare('INSERT INTO offline_queue (type, target, payload, created_at) VALUES (?, ?, ?, ?)').run(
      'CHRONICLE', eventType, JSON.stringify(envelope), new Date().toISOString()
    );
    scheduleFlush();
  }
}
