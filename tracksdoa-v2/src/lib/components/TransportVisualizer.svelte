<script lang="ts">
  export let event: any = null;

  $: negotiationDetails = event?.payload?.negotiation || null;
</script>

<div class="transport-visualizer">
  <h3>Transport Negotiation</h3>
  
  {#if !event || event.type !== 'routing' || !negotiationDetails}
    <div class="empty-state">
      Waiting for routing/negotiation events...
    </div>
  {:else}
    <div class="negotiation-flow">
      <div class="node source">
        <span class="label">Source</span>
        <span class="name">{negotiationDetails.source || 'Unknown'}</span>
      </div>
      
      <div class="pathway">
        <div class="protocol">{negotiationDetails.protocol || 'TCP/IP'}</div>
        <div class="arrow">⟶</div>
        <div class="latency">{negotiationDetails.latency || '0'}ms</div>
      </div>
      
      <div class="node target">
        <span class="label">Target</span>
        <span class="name">{negotiationDetails.target || 'Unknown'}</span>
      </div>
    </div>
    
    <div class="metrics">
      <div class="metric">
        <span class="m-label">Payload Size</span>
        <span class="m-val">{negotiationDetails.payloadSize || 0} bytes</span>
      </div>
      <div class="metric">
        <span class="m-label">Status</span>
        <span class="m-val status {negotiationDetails.status || 'pending'}">{negotiationDetails.status || 'Pending'}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .transport-visualizer {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.5rem;
  }
  h3 {
    margin: 0 0 1.5rem 0;
    color: #c9d1d9;
    font-size: 1.1rem;
  }
  .empty-state {
    color: #8b949e;
    font-style: italic;
    text-align: center;
    padding: 2rem 0;
  }
  .negotiation-flow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #161b22;
    padding: 2rem;
    border-radius: 6px;
    border: 1px solid #30363d;
    margin-bottom: 1.5rem;
  }
  .node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .node .label {
    font-size: 0.75rem;
    color: #8b949e;
    text-transform: uppercase;
  }
  .node .name {
    font-weight: bold;
    color: #58a6ff;
    background: rgba(88, 166, 255, 0.1);
    padding: 0.5rem 1rem;
    border-radius: 4px;
    border: 1px solid rgba(88, 166, 255, 0.2);
  }
  .pathway {
    display: flex;
    flex-direction: column;
    align-items: center;
    color: #8b949e;
  }
  .arrow {
    font-size: 2rem;
    line-height: 1;
    color: #3fb950;
  }
  .protocol { font-family: monospace; font-size: 0.85rem; }
  .latency { font-family: monospace; font-size: 0.85rem; color: #d29922; }
  
  .metrics {
    display: flex;
    gap: 1rem;
  }
  .metric {
    flex: 1;
    background: #161b22;
    border: 1px solid #30363d;
    padding: 1rem;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .m-label {
    font-size: 0.8rem;
    color: #8b949e;
    margin-bottom: 0.5rem;
  }
  .m-val {
    font-size: 1.1rem;
    font-weight: bold;
    color: #c9d1d9;
  }
  .status.success { color: #3fb950; }
  .status.pending { color: #d29922; }
  .status.failed { color: #f85149; }
</style>
