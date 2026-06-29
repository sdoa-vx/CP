<script lang="ts">
  export let node: any = null;
</script>

<div class="capability-explorer">
  {#if node}
    <div class="explorer-header">
      <h3>Capability Surface: {node.name || node.id}</h3>
    </div>
    
    <div class="explorer-body">
      {#if node.capabilities && node.capabilities.length > 0}
        <div class="capability-grid">
          {#each node.capabilities as cap}
            <div class="capability-card">
              <span class="cap-icon">⚡</span>
              <span class="cap-name">{cap}</span>
              <!-- We could expand this with more detailed data from the Registrar if available -->
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          No capabilities surfaced for this node.
        </div>
      {/if}
    </div>
  {:else}
    <div class="empty-state">
      Select a node to explore its capabilities.
    </div>
  {/if}
</div>

<style>
  .capability-explorer {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    height: 100%;
  }
  .explorer-header h3 {
    margin: 0;
    color: #c9d1d9;
    font-size: 1.1rem;
  }
  .explorer-body {
    flex: 1;
    overflow-y: auto;
  }
  .capability-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }
  .capability-card {
    background: #161b22;
    border: 1px solid #30363d;
    padding: 1rem;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    transition: transform 0.2s, border-color 0.2s;
  }
  .capability-card:hover {
    transform: translateY(-2px);
    border-color: #58a6ff;
  }
  .cap-icon {
    font-size: 1.25rem;
  }
  .cap-name {
    color: #58a6ff;
    font-family: monospace;
    font-size: 0.9rem;
    word-break: break-all;
  }
  .empty-state {
    color: #8b949e;
    font-style: italic;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100px;
  }
</style>
