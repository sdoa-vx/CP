<script lang="ts">
  import { routingStore } from '$lib/state/stores';
  import { waterfall } from '$lib/animation/waterfallFlow';
</script>

<div class="waterfall-page">
  <h1>Routing Waterfall (Triage)</h1>
  
  <div class="waterfall">
    {#each $routingStore as event (event.id)}
      <div class="event" use:waterfall>
        <strong>{event.event_type}</strong>
        <p>{event.details?.reason || JSON.stringify(event.payload)}</p>
        <small>{new Date(event.timestamp || Date.now()).toLocaleTimeString()}</small>
      </div>
    {/each}
  </div>
</div>

<style>
  .waterfall-page {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .waterfall {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1rem;
    position: relative;
  }
  .event {
    background: linear-gradient(
      to bottom,
      rgba(88, 166, 255, 0.1),
      rgba(88, 166, 255, 0.05)
    );
    padding: 0.5rem 1rem;
    margin-bottom: 0.25rem;
    border-radius: 4px;
    backdrop-filter: blur(4px);
    border-left: 3px solid #58a6ff;
  }
  p { margin: 0.25rem 0; font-size: 0.9rem; opacity: 0.9; }
  small { opacity: 0.6; font-family: monospace; }
</style>
