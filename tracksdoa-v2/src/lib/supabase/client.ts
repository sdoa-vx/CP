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

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    realtime: { params: { eventsPerSecond: 10 } }
  }
);
