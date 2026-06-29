<script lang="ts">
  import { governanceStore, proposalStore } from '../../state/stores';

  $: events = $governanceStore.filter(e => e.authority === 'coach');
</script>

<div class="console coach">
  <h1>Coach — Conceptual Guidance</h1>

  {#each events as event}
    <div class="event">
      <strong>{event.event_type}</strong>
      <p>{event.details?.reasoning}</p>

      {#if $proposalStore[event.proposal_id]}
        <details>
          <summary>Proposal Details</summary>
          <pre>{JSON.stringify($proposalStore[event.proposal_id], null, 2)}</pre>
        </details>
      {/if}
    </div>
  {/each}
</div>

<style>
  .console {
    padding: 1rem;
    background: rgba(255, 215, 0, 0.05);
    border: 1px solid rgba(255, 215, 0, 0.2);
    border-radius: 8px;
  }
  .event {
    margin-top: 1rem;
    padding: 1rem;
    background: rgba(255,255,255,0.05);
    border-radius: 4px;
  }
  pre {
    background: #000;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
  }
</style>
