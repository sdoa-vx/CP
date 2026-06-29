<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  
  export let node: any = null;
  
  function close() {
    dispatch('close');
  }
</script>

{#if node}
  <div class="flyout-overlay" on:click={close}></div>
  <div class="flyout">
    <div class="flyout-header">
      <h2>{node.name || node.id || 'Unknown Sleeve'}</h2>
      <button class="close-btn" on:click={close}>&times;</button>
    </div>
    <div class="flyout-content">
      <div class="detail-section">
        <h3>Identity</h3>
        <p><strong>Type:</strong> {node.type || 'Sleeve'}</p>
        <p><strong>Group:</strong> {node.group || 1}</p>
      </div>

      <div class="detail-section">
        <h3>Capability Surface</h3>
        {#if node.capabilities && node.capabilities.length > 0}
          <ul class="caps-list">
            {#each node.capabilities as cap}
              <li>{cap}</li>
            {/each}
          </ul>
        {:else}
          <p class="empty">No capabilities surfaced.</p>
        {/if}
      </div>

      <div class="detail-section">
        <h3>Oracle Routing Rank</h3>
        <p class="score">{node.rank || 'Unranked'}</p>
      </div>

      <div class="detail-section">
        <h3>Cartographer Drift</h3>
        <p class="drift">{node.drift ? node.drift.toFixed(2) : 'Stable'}</p>
      </div>
    </div>
  </div>
{/if}

<style>
  .flyout-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    z-index: 1000;
  }
  .flyout {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 400px;
    background: #0d1117;
    border-left: 1px solid #30363d;
    z-index: 1001;
    display: flex;
    flex-direction: column;
    box-shadow: -5px 0 15px rgba(0,0,0,0.5);
    animation: slideIn 0.3s ease-out;
  }
  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  .flyout-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid #30363d;
    background: #161b22;
  }
  .flyout-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: #c9d1d9;
  }
  .close-btn {
    background: transparent;
    border: none;
    color: #8b949e;
    font-size: 1.5rem;
    cursor: pointer;
  }
  .close-btn:hover { color: #f85149; }
  .flyout-content {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .detail-section h3 {
    margin: 0 0 0.5rem 0;
    font-size: 0.85rem;
    color: #8b949e;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .detail-section p {
    margin: 0;
    color: #c9d1d9;
  }
  .caps-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .caps-list li {
    background: rgba(88, 166, 255, 0.1);
    color: #58a6ff;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    border: 1px solid rgba(88, 166, 255, 0.2);
  }
  .empty { font-style: italic; color: #8b949e; }
  .score { font-size: 1.5rem; font-weight: bold; color: #3fb950; }
  .drift { font-size: 1.5rem; font-weight: bold; color: #d29922; }
</style>
