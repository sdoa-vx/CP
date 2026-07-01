/**
 * @SdoaManifest
 * id: ChronicleLoader
 * type: UI_LOGIC
 * version: 1.0.0
 * description: Loads a time-sliced history from the Supabase chronicle_events table.
 * capabilities: db.read, history.load
 * dependencies: supabase-js
 */
import { supabase } from '$lib/supabase/client';

export async function loadChronicleRange(start: string, end: string) {
  if (!supabase) {
    console.warn("[TimeMachine] Supabase client is not initialized.");
    return [];
  }
  const { data, error } = await supabase
    .from('chronicle_events')
    .select('*')
    .gte('timestamp', start)
    .lte('timestamp', end)
    .order('timestamp', { ascending: true });

  if (error) {
    console.error("Failed to load chronicle range", error);
    return [];
  }
  return data || [];
}

export async function loadRecentChronicle(limit = 1000) {
  if (!supabase) {
    console.warn("[TimeMachine] Supabase client is not initialized.");
    return [];
  }
  const { data, error } = await supabase
    .from('chronicle_events')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to load recent chronicle", error);
    return [];
  }
  // Reverse to make it chronological
  return (data || []).reverse();
}
