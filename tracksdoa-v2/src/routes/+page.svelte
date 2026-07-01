<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { scanStore } from '$lib/state/stores';

  let status: any = null;
  let state: any = null;

  onMount(async () => {
    try {
      const [statusRes, stateRes] = await Promise.all([
        fetch(`${base}/api/status`),
        fetch(`${base}/api/state`)
      ]);
      if (statusRes.ok) status = await statusRes.json();
      if (stateRes.ok) state = await stateRes.json();
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    }
  });

  const cards = [
    { id: 'mesh', title: 'Mesh View', icon: '🌐', path: '/mesh', desc: 'Interactive node graph of project intelligence', metric: (st: any) => st ? `${Object.values(st.detectorHits || {}).reduce((a:any,b:any)=>a+b,0)} Insights` : 'Loading...' },
    { id: 'proposals', title: 'Proposals', icon: '📝', path: '/proposals', desc: 'Pending system proposals and legacy queue', metric: (_st: any, stat: any) => stat ? `${stat.proposals.queued} Pending / ${stat.proposals.total} Total` : 'Loading...' },
    { id: 'scan', title: 'Scan Engine', icon: '🔍', path: '/scan', desc: 'Real-time AST cache and engine scanning', metric: (st: any, _stat: any, scan: any) => scan?.active ? `Scanning: ${scan.percent}% (${scan.index}/${scan.total})` : (st ? `${st.astCacheSize} Files Cached` : 'Loading...') },
    { id: 'governance', title: 'Governance', icon: '⚖️', path: '/governance', desc: 'System governance, sigils, and policies', metric: () => 'Active' },
    { id: 'timeline', title: 'Timeline', icon: '⏱️', path: '/timeline', desc: 'Innovation tracking and system evolution', metric: () => 'Active' },
    { id: 'lineage', title: 'Lineage', icon: '🧬', path: '/lineage', desc: 'Component ancestry and dependency tracking', metric: () => 'Active' },
    { id: 'drift', title: 'Drift', icon: '📈', path: '/drift', desc: 'Heatmaps and code drift detection', metric: () => 'Active' },
    { id: 'time-machine', title: 'Time Machine', icon: '⏳', path: '/time-machine', desc: 'Historical snapshots and rewinds', metric: () => 'Active' },
  ];
</script>

<div class="control-center">
  <header>
    <h1>Control Center</h1>
    <p>At-a-glance overview of the SDOA MCP Engine</p>
  </header>

  <div class="grid">
    {#each cards as card}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <div class="card" on:click={() => goto(`${base}${card.path}`)}>
        <div class="card-header">
          <span class="icon">{card.icon}</span>
          <h2>{card.title}</h2>
        </div>
        <p class="desc">{card.desc}</p>
        <div class="metric">{card.metric(state, status, $scanStore)}</div>
      </div>
    {/each}
  </div>
</div>

<style>
  .control-center {
    max-width: 1200px;
    margin: 0 auto;
    color: #c9d1d9;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  }
  header {
    margin-bottom: 2rem;
  }
  h1 {
    margin: 0;
    font-size: 2rem;
    color: #58a6ff;
  }
  header p {
    color: #8b949e;
    margin-top: 0.5rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
  }
  .card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.5rem;
    cursor: pointer;
    transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
    display: flex;
    flex-direction: column;
  }
  .card:hover {
    transform: translateY(-2px);
    border-color: #58a6ff;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }
  .card-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .icon {
    font-size: 1.5rem;
  }
  .card-header h2 {
    margin: 0;
    font-size: 1.2rem;
    color: #e6edf3;
  }
  .desc {
    color: #8b949e;
    font-size: 0.9rem;
    flex: 1;
    margin: 0 0 1.5rem 0;
    line-height: 1.4;
  }
  .metric {
    font-family: monospace;
    font-size: 0.85rem;
    color: #3fb950;
    background: #21262d;
    padding: 0.4rem 0.6rem;
    border-radius: 4px;
    display: inline-block;
    align-self: flex-start;
  }
</style>
