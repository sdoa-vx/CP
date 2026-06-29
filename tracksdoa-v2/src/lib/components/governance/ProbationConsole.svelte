<script lang="ts">
  import { governanceStore } from '../../state/stores';

  $: events = $governanceStore.filter(e => e.authority === 'probation');
</script>

<div class="console probation">
  <h1>Probation Officer — Capability Validation</h1>

  {#each events as event}
    <div class="event">
      <strong>{event.event_type}</strong>
      <pre>{JSON.stringify(event.details, null, 2)}</pre>
    </div>
  {/each}
</div>

<style>
  .console {
    padding: 1rem;
    background: rgba(255, 0, 0, 0.05);
    border: 1px solid rgba(255, 0, 0, 0.2);
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
