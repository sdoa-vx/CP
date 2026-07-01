<script lang="ts">
  import { proposalStore } from '../state/stores';
  import { supabase } from '../supabase/client';
  import { base } from '$app/paths';

  let selected: string | null = null;

  async function approve(id: string) {
    try {
      const res = await fetch(`/fisp/v1/proposals/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approve', applyToCanonical: true, notes: 'Approved via dashboard' })
      });
      if (res.ok) {
        proposalStore.update(s => {
          if (s[id]) {
            s[id].state = 'accepted';
          }
          return s;
        });
      } else {
        console.error("Approve failed on backend:", await res.text());
      }
    } catch (err) {
      console.error("Failed to approve proposal on backend:", err);
    }

    if (supabase) {
      try {
        await supabase
          .from('proposals')
          .update({ state: 'approved' })
          .eq('id', id);
      } catch (err) {
        console.warn("Failed to sync approval to Supabase:", err);
      }
    }
  }

  async function reject(id: string) {
    try {
      const res = await fetch(`/fisp/v1/proposals/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'reject', applyToCanonical: false, notes: 'Rejected via dashboard' })
      });
      if (res.ok) {
        proposalStore.update(s => {
          if (s[id]) {
            s[id].state = 'rejected';
          }
          return s;
        });
      } else {
        console.error("Reject failed on backend:", await res.text());
      }
    } catch (err) {
      console.error("Failed to reject proposal on backend:", err);
    }

    if (supabase) {
      try {
        await supabase
          .from('proposals')
          .update({ state: 'rejected' })
          .eq('id', id);
      } catch (err) {
        console.warn("Failed to sync rejection to Supabase:", err);
      }
    }
  }
</script>

<div class="post-scan-proposals">
  <h2>Post-Scan Proposals (Sovereign Decision)</h2>

  <div class="proposal-list">
    {#each Object.values($proposalStore) as proposal}
      <button
        class:selected={selected === proposal.id}
        on:click={() => (selected = proposal.id)}
      >
        {proposal.module_suggestion} ({proposal.state})
      </button>
    {/each}
  </div>

  {#if selected && $proposalStore[selected]}
    {@const proposal = $proposalStore[selected]}
    <div class="proposal-details">
      <h3>{proposal.module_suggestion}</h3>

      <details>
        <summary>Capability Surface</summary>
        <pre>{JSON.stringify(proposal.capability_surface, null, 2)}</pre>
      </details>

      <details open>
        <summary>Reasoning</summary>
        <p>{proposal.reasoning}</p>
      </details>

      <div class="actions">
        <button class="approve" on:click={() => approve(proposal.id)}>Approve</button>
        <button class="reject" on:click={() => reject(proposal.id)}>Reject</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .post-scan-proposals {
    margin-top: 2rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.1);
  }
  .proposal-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .proposal-list button {
    background: rgba(255,255,255,0.1);
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    color: white;
    cursor: pointer;
  }
  .proposal-list button.selected {
    background: #4af;
    color: black;
    font-weight: bold;
  }
  .proposal-details {
    background: rgba(0,0,0,0.2);
    padding: 1rem;
    border-radius: 6px;
  }
  pre {
    background: black;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
  }
  .actions {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
  }
  .actions button {
    padding: 0.5rem 2rem;
    border: none;
    border-radius: 4px;
    font-weight: bold;
    cursor: pointer;
  }
  .actions .approve {
    background: #3c3;
    color: black;
  }
  .actions .reject {
    background: #c33;
    color: white;
  }
</style>
