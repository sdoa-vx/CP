<script lang="ts">
  import { governanceStore } from '../../state/stores';

  $: events = $governanceStore.filter(e => e.authority === 'oracle');
</script>

<div class="console oracle">
  <h1>Oracle — Routing Surfaces</h1>

  {#each events as event}
    <div class="event">
      <strong>{event.event_type}</strong>

      <details>
        <summary>Surface Diff</summary>
        <pre>{JSON.stringify(event.details?.routing_surface_diff, null, 2)}</pre>
      </details>

      <details>
        <summary>Drift Penalty</summary>
        <pre>{JSON.stringify(event.details?.drift_penalty, null, 2)}</pre>
      </details>
    </div>
  {/each}
</div>

<style>
  .console {
    padding: 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.2);
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
