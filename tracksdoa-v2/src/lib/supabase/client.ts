/**
 * @SdoaManifest
 * id: SupabaseClient
 * type: UI_LOGIC
 * version: 1.0.0
 * description: SvelteKit Supabase Client for the entire v2 interface.
 * capabilities: db.connect
 * dependencies: supabase-js
 */
import { createClient } from '@supabase/supabase-js';

export let supabase: any = null;

export function initSupabase(url: string, key: string) {
  if (url && key) {
    try {
      supabase = createClient(url, key, {
        realtime: { params: { eventsPerSecond: 10 } }
      });
    } catch (e) {
      console.error("[Supabase Client] Failed to create client:", e);
    }
  }
}
