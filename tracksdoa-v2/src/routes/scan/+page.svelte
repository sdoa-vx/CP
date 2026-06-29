<script lang="ts">
  import { scanStore } from '$lib/state/stores';
  import { proposalStore } from '$lib/state/stores';
  import ScanFileVisual from '$lib/components/ScanFileVisual.svelte';
  import ScanProgressMeter from '$lib/components/ScanProgressMeter.svelte';
  import InnovationSummary from '$lib/components/InnovationSummary.svelte';
  import PostScanProposals from '$lib/components/PostScanProposals.svelte';
</script>

<div class="scan-page">
  <h1>Innovation Detector Scan</h1>

  <div class="scan-header">
    <ScanFileVisual />
    <ScanProgressMeter />
  </div>

  <div class="scan-results">
    {#if !$scanStore.active && $scanStore.total > 0}
      <section>
        <h2>Coverage</h2>
        <p>Files scanned: {$scanStore.total}</p>
      </section>

      <InnovationSummary />
      <PostScanProposals />

    {:else if $scanStore.active}
      <div class="scanning-state">
        <p>Scan in progress…</p>
        <div class="spinner"></div>
      </div>
    {:else}
      <p>Awaiting scan start...</p>
    {/if}
  </div>
</div>

<style>
  .scan-page {
    max-width: 1200px;
    margin: 0 auto;
  }
  .scan-header {
    margin-bottom: 2rem;
    padding: 1.5rem;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
  }
  .scan-results {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }
  .scanning-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4rem;
    opacity: 0.7;
  }
  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid rgba(255,255,255,0.1);
    border-top: 4px solid #4af;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-top: 1rem;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>
