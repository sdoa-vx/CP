<script lang="ts">
  import { proposalStore, governanceStore } from '$lib/state/stores';
  import GovernanceSigils from '$lib/components/GovernanceSigils.svelte';
  
  let activeTab = 'coach';
  
  const tabs = [
    { id: 'coach', label: 'Coach', icon: '🧠' },
    { id: 'registrar', label: 'Registrar', icon: '📝' },
    { id: 'probation', label: 'ProbationOfficer', icon: '🛡️' },
    { id: 'oracle', label: 'Oracle', icon: '🔮' },
    { id: 'cartographer', label: 'Cartographer', icon: '🗺️' }
  ];
</script>

<div class="governance-page">
  <div class="header">
    <h1>Sovereign Governance Consoles</h1>
    <GovernanceSigils />
  </div>

  <div class="tabs">
    {#each tabs as tab}
      <button 
        class="tab-btn" 
        class:active={activeTab === tab.id}
        on:click={() => activeTab = tab.id}
      >
        <span class="icon">{tab.icon}</span>
        {tab.label}
      </button>
    {/each}
  </div>

  <div class="console-content">
    {#if activeTab === 'coach'}
      <div class="console">
        <h2>Coach Metrics</h2>
        <p>Telemetry, operational cadence, and system health assessments.</p>
        <!-- Replace with specific Coach component -->
        <div class="placeholder-data">
          <pre>{JSON.stringify($governanceStore, null, 2)}</pre>
        </div>
      </div>
    {:else if activeTab === 'registrar'}
      <div class="console">
        <h2>Registrar Lineage</h2>
        <p>Capability registries, node tracking, and architectural lineage.</p>
      </div>
    {:else if activeTab === 'probation'}
      <div class="console">
        <h2>ProbationOfficer Constraints</h2>
        <p>Safety boundary checks, violation reporting, and compliance assertions.</p>
      </div>
    {:else if activeTab === 'oracle'}
      <div class="console">
        <h2>Oracle Scoring</h2>
        <p>Multi-factor rankings and capability surface scoring.</p>
      </div>
    {:else if activeTab === 'cartographer'}
      <div class="console">
        <h2>Cartographer Drift Forecasts</h2>
        <p>Architectural drift, slope velocity, and threshold proximity.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .governance-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 2rem;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #161b22;
    padding: 1.5rem;
    border: 1px solid #30363d;
    border-radius: 8px;
  }
  .header h1 {
    margin: 0;
  }
  .tabs {
    display: flex;
    gap: 1rem;
    border-bottom: 1px solid #30363d;
    padding-bottom: 0.5rem;
  }
  .tab-btn {
    background: transparent;
    border: none;
    color: #8b949e;
    font-size: 1rem;
    cursor: pointer;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .tab-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #c9d1d9;
  }
  .tab-btn.active {
    background: #21262d;
    color: white;
    font-weight: bold;
    border-bottom: 2px solid #58a6ff;
  }
  .console-content {
    flex: 1;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 2rem;
    overflow-y: auto;
  }
  .placeholder-data {
    background: #0d1117;
    padding: 1rem;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.9rem;
    color: #8b949e;
    overflow-x: auto;
  }
</style>
