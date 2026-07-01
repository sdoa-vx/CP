/**
 * @SdoaManifest
 * id: ProposalChannel
 * type: UI_LOGIC
 * version: 1.0.0
 * description: Hydrates proposalStore from the local backend and keeps it live via SSE.
 * capabilities: proposal.list, proposal.live
 * dependencies: svelte
 */
import { base } from '$app/paths';
import { proposalStore } from './stores';

function upsert(p: any) {
  if (!p?.id) return;
  proposalStore.update(s => ({ ...s, [p.id]: { ...s[p.id], ...p } }));
}

export async function initProposalChannel() {
  try {
    const res = await fetch(`${base}/api/proposals/json`);
    if (res.ok) {
      const rows = await res.json();
      proposalStore.set(Object.fromEntries(rows.map((p: any) => [p.id, p])));
    }
  } catch {
    // Dashboard just starts with an empty list - the SSE listener below will still
    // pick up anything created after this point.
  }

  const es = new EventSource(`${base}/api/events?stream=true`);
  es.addEventListener('proposal:created', (event: MessageEvent) => {
    try { upsert(JSON.parse(event.data).payload); } catch { /* ignore malformed event */ }
  });
  es.addEventListener('proposal:updated', (event: MessageEvent) => {
    try { upsert(JSON.parse(event.data).payload); } catch { /* ignore malformed event */ }
  });

  return () => es.close();
}
