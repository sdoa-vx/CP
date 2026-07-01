
export const MANIFEST = {
  id: "offlineSync.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "startOfflineSync",
    "stopOfflineSync",
    "scheduleFlush",
    "flushQueue"
  ],
  dependencies: [
    "../fisp/database",
    "../utils/supabase",
    "../federation/handshake",
    "../engine/telemetry",
    "../engine/events"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

import { db } from '../fisp/database';
import { supabase, evaluateConnection } from '../utils/supabase';
import { generateSignature } from '../federation/handshake';
import { telemetry } from '../engine/telemetry';
import { emit } from '../engine/events';

let syncInterval: NodeJS.Timeout | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let isFlushing = false;
let backoffMs = 0;

const DEBOUNCE_MS = 2000;
const MIN_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 180000;
const FALLBACK_TICK_MS = 180000;

export function startOfflineSync() {
  if (syncInterval) return;
  // Pure safety net in case scheduleFlush() is ever missed - the real cadence is event-driven.
  syncInterval = setInterval(() => scheduleFlush(), FALLBACK_TICK_MS);
}

export function stopOfflineSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

/**
 * Call this whenever a row is inserted into offline_queue. Debounces a burst of inserts
 * into one flush and, while backing off after real failures, respects the current backoff
 * delay instead of hammering an unreachable endpoint.
 */
export function scheduleFlush() {
  if (debounceTimer) return;
  const delay = backoffMs > 0 ? backoffMs : DEBOUNCE_MS;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runFlushLoop();
  }, delay);
}

async function runFlushLoop() {
  if (isFlushing) return;
  isFlushing = true;
  try {
    await evaluateConnection();

    let result = await flushQueue();
    while (result.flushed > 0) {
      const depth = (db.prepare('SELECT COUNT(*) as c FROM offline_queue').get() as { c: number }).c;
      if (depth === 0) break;
      result = await flushQueue();
    }

    if (result.failed > 0) {
      // Real congestion/outage - back off instead of retrying at a fixed cadence.
      backoffMs = backoffMs > 0 ? Math.min(backoffMs * 2, MAX_BACKOFF_MS) : MIN_BACKOFF_MS;
      scheduleFlush();
    } else {
      backoffMs = 0;
    }

    await pullCanonicalLibrary();
  } finally {
    isFlushing = false;
  }
}

async function processItem(item: any): Promise<boolean> {
  let success = false;
  const payload = JSON.parse(item.payload);

  try {
    if (item.type === 'SUPABASE') {
      if (supabase) {
        let result;
        if (item.target === 'sdoa_portfolio') {
          // Fix for duplicate key value violates unique constraint "sdoa_portfolio_module_id_workspace_hash_key"
          result = await supabase.from(item.target).upsert(payload, { onConflict: 'module_id,workspace_hash' });
        } else {
          result = await supabase.from(item.target).upsert(payload);
        }
        
        if (!result.error) {
          success = true;
        } else if (result.error.code === '23505') {
          // If it still throws a unique constraint error on another table, consider it already synced
          success = true;
        } else {
          console.error(`[SDOA MCP] Supabase insert error on ${item.target}:`, result.error);
        }
      } else {
        success = false; // Supabase not configured, keep in queue
      }
    } else if (item.type === 'FEDERATION') {
      const body = JSON.stringify(payload);
      const signature = generateSignature(body);
      const res = await fetch(`${item.target}/federation/v1/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mcp-signature': signature },
        body
      });
      if (res.ok) success = true;
    } else if (item.type === 'CHRONICLE') {
      // payload is the full {module_id, event_type, timestamp, payload} envelope built by chronicleBridge.ts
      const res = await fetch('http://127.0.0.1:8081/chronicle/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(1500)
      });
      if (res.ok) success = true;
    }
  } catch (err) { 
    console.error(err); 
  }

  return success;
}

export async function flushQueue(): Promise<{ flushed: number; failed: number }> {
  let flushed = 0;
  let failed = 0;
  try {
    const items = db.prepare('SELECT * FROM offline_queue ORDER BY id ASC LIMIT 50').all() as any[];
    if (!items || items.length === 0) return { flushed: 0, failed: 0 };

    telemetry.setState('syncing');
    emit('sync:start', { queued: items.length });

    for (const item of items) {
      const success = await processItem(item);

      if (success) {
        db.prepare('DELETE FROM offline_queue WHERE id = ?').run(item.id);
        flushed++;
      } else {
        failed++;
      }
    }

    telemetry.setSyncStatus(failed === 0 ? 'ok' : 'error');
    telemetry.setState('idle');
    emit('sync:flush', { flushed, failed });
  } catch (dbErr) {
    telemetry.setSyncStatus('error');
    telemetry.setState('idle');
    emit('sync:error', { error: String(dbErr) });
  }
  return { flushed, failed };
}

async function pullCanonicalLibrary() {
  if (!supabase) return;
  try {
    const lastSyncRow = db.prepare("SELECT value FROM metadata_store WHERE key = 'last_sync_time'").get() as { value: string } | undefined;
    const lastSyncTime = lastSyncRow ? lastSyncRow.value : '1970-01-01T00:00:00.000Z';

    const { data, error } = await supabase
      .from('sdoa_portfolio')
      .select('*')
      .gt('timestamp', lastSyncTime)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error("[OfflineSync] Pull sync error:", error);
      return;
    }

    if (data && data.length > 0) {
      const insert = db.prepare('INSERT OR REPLACE INTO canonical_library (id, module_id, version, payload, timestamp) VALUES (?, ?, ?, ?, ?)');
      const updateSync = db.prepare("INSERT OR REPLACE INTO metadata_store (key, value) VALUES ('last_sync_time', ?)");

      db.transaction(() => {
        let latestTime = lastSyncTime;
        for (const row of data) {
          insert.run(row.id, row.module_id, row.version, JSON.stringify(row), row.timestamp);
          if (row.timestamp > latestTime) latestTime = row.timestamp;
        }
        updateSync.run(latestTime);
      })();
      emit('sync:pull', { pulled: data.length });
    }
  } catch (err) {
    console.error("[OfflineSync] Error pulling canonical library:", err);
  }
}
