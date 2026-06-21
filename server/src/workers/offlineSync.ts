import { db } from '../fisp/database';
import { supabase } from '../utils/supabase';
import { generateSignature } from '../federation/handshake';

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

async function processQueue() {
  try {
    const items = db.prepare('SELECT * FROM offline_queue ORDER BY id ASC LIMIT 50').all() as any[];
    if (!items || items.length === 0) return;

    for (const item of items) {
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
        // completely silent
      }

      if (success) {
        db.prepare('DELETE FROM offline_queue WHERE id = ?').run(item.id);
      }
    }
  } catch (dbErr) {
    // completely silent
  }
}
