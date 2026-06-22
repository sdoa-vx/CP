import { db } from '../fisp/database';
import { supabase } from '../utils/supabase';
import { generateSignature } from '../federation/handshake';
import { telemetry } from '../engine/telemetry';
import { emit } from '../engine/events';

let syncInterval: NodeJS.Timeout | null = null;

export function startOfflineSync() {
  if (syncInterval) return;
  // Run every 3 minutes (180000 ms)
  syncInterval = setInterval(processQueue, 180000);
}

export function stopOfflineSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

async function processItem(item: any): Promise<boolean> {
  let success = false;
  const payload = JSON.parse(item.payload);

  try {
    if (item.type === 'SUPABASE') {
      const { error } = await supabase.from(item.target).insert(payload);
      if (!error) success = true;
    } else if (item.type === 'FEDERATION') {
      const body = JSON.stringify(payload);
      const signature = generateSignature(body);
      const res = await fetch(`${item.target}/federation/v1/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mcp-signature': signature },
        body
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

async function processQueue() {
  await flushQueue();
}
