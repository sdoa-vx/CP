<script lang="ts">
  import { proposalStore, governanceStore, lineageStore } from '$lib/state/stores';
  import GovernanceSigils from '$lib/components/GovernanceSigils.svelte';
  import GovernanceConsole from '$lib/components/GovernanceConsole.svelte';

  let activeSigil = 'coach';
</script>

<h1>Innovation Pipeline</h1>

<GovernanceSigils />

<div style="margin-top: 1rem; margin-bottom: 2rem;">
  <select bind:value={activeSigil}>
    <option value="coach">Coach</option>
    <option value="registrar">Registrar</option>
    <option value="probation">Probation Officer</option>
    <option value="oracle">Oracle</option>
    <option value="cartographer">Cartographer</option>
  </select>
  <GovernanceConsole active={activeSigil} />
</div>

<h2>Live Proposals</h2>
<div class="proposal-console">
  {#each Object.values($proposalStore) as proposal}
    <div class="proposal-card">
      <h3>{proposal.module_suggestion}</h3>
      <p>{proposal.reasoning}</p>

      <div class="state {proposal.state}">{proposal.state}</div>

      <details>
        <summary>Capability Surface</summary>
        <pre>{JSON.stringify(proposal.capability_surface, null, 2)}</pre>
      </details>

      <details>
        <summary>Governance Events</summary>
        {#each $governanceStore.filter(e => e.proposal_id === proposal.id) as event}
          <div class="gov-event">
            <strong>{event.authority}</strong>: {event.event_type}
          </div>
        {/each}
      </details>

      <details>
        <summary>Lineage</summary>
        <pre>{JSON.stringify($lineageStore[proposal.id], null, 2)}</pre>
      </details>
    </div>
  {/each}
</div>

<style>
  .proposal-console {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 1.5rem;
  }
  .proposal-card {
    background: #161b22;
    border: 1px solid #30363d;
    padding: 1.5rem;
    border-radius: 8px;
  }
  .state {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: bold;
    text-transform: uppercase;
    margin-bottom: 1rem;
  }
  .state.pending { background: rgba(255, 215, 0, 0.2); color: gold; }
  .state.approved { background: rgba(50, 205, 50, 0.2); color: limegreen; }
  .state.rejected { background: rgba(255, 99, 71, 0.2); color: tomato; }
  pre {
    background: #0d1117;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.85rem;
  }
  .gov-event {
    padding: 0.5rem;
    border-bottom: 1px solid #30363d;
    font-size: 0.9rem;
  }
  select {
    padding: 0.5rem;
    margin-bottom: 1rem;
    background: #161b22;
    color: white;
    border: 1px solid #30363d;
    border-radius: 4px;
  }
</style>
