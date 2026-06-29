<script lang="ts">
  export let event: any = null;
  
  $: batchDetails = event?.payload?.batch || null;
</script>

<div class="batch-flow-panel">
  <h3>Batch Flow Diagnostics</h3>
  
  {#if !event || event.type !== 'mesh' || !batchDetails}
    <div class="empty-state">
      Waiting for batch flow events...
    </div>
  {:else}
    <div class="flow-stats">
      <div class="stat-box">
        <span class="label">Batch ID</span>
        <span class="val id">{batchDetails.id || 'N/A'}</span>
      </div>
      <div class="stat-box">
        <span class="label">Size</span>
        <span class="val">{batchDetails.size || 0} items</span>
      </div>
      <div class="stat-box">
        <span class="label">Throughput</span>
        <span class="val">{batchDetails.throughput || 0} req/s</span>
      </div>
    </div>
    
    <div class="progress-section">
      <div class="progress-header">
        <span>Processing Status</span>
        <span>{batchDetails.progress || 0}%</span>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar" style="width: {batchDetails.progress || 0}%"></div>
      </div>
    </div>
  {/if}
</div>

<style>
  .batch-flow-panel {
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
  .flow-stats {
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
  }
  .stat-box {
    flex: 1;
    background: #161b22;
    border: 1px solid #30363d;
    padding: 1rem;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .label {
    font-size: 0.8rem;
    color: #8b949e;
    margin-bottom: 0.5rem;
  }
  .val {
    font-size: 1.25rem;
    font-weight: bold;
    color: #c9d1d9;
  }
  .val.id {
    font-family: monospace;
    font-size: 1rem;
    color: #d29922;
  }
  .progress-section {
    background: #161b22;
    padding: 1.5rem;
    border-radius: 6px;
    border: 1px solid #30363d;
  }
  .progress-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    color: #c9d1d9;
    font-weight: bold;
  }
  .progress-bar-container {
    height: 8px;
    background: #0d1117;
    border-radius: 4px;
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    background: #58a6ff;
    transition: width 0.3s ease;
  }
</style>
