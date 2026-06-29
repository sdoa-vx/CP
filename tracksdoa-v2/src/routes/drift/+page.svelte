<script lang="ts">
  import { driftStore, meshEffectsStore, routingStore } from '$lib/state/stores';
  import { driftWave } from '$lib/animation/driftWave';
</script>

<div class="drift-page">
  <h1>Drift Horizon (Cartographer)</h1>

  <div class="metrics">
    <div class="metric">
      <span class="label">Volatility</span>
      <span class="value">{$driftStore.volatility || '0.0%'}</span>
    </div>
    <div class="metric">
      <span class="label">Drift Slope</span>
      <span class="value">{$driftStore.slope || '0.0'}</span>
    </div>
    <div class="metric">
      <span class="label">Time to Threshold</span>
      <span class="value">{$driftStore.timeToThreshold || 'Stable'}</span>
    </div>
  </div>

  <div class="horizon" use:driftWave>
    <!-- Placeholder for visual horizon graph -->
    <div class="horizon-line"></div>
  </div>
</div>

<style>
  .drift-page {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .metrics {
    display: flex;
    gap: 2rem;
    margin-bottom: 2rem;
  }
  .metric {
    background: #161b22;
    padding: 1.5rem;
    border-radius: 8px;
    border: 1px solid #30363d;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .label { font-size: 0.9rem; opacity: 0.8; margin-bottom: 0.5rem; }
  .value { font-size: 1.5rem; font-weight: bold; color: #3fb950; }
  .horizon {
    flex: 1;
    background: linear-gradient(to top, rgba(88, 166, 255, 0.1), transparent);
    border: 1px solid #30363d;
    border-radius: 8px;
    position: relative;
    overflow: hidden;
  }
  .horizon-line {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 2px;
    background: #58a6ff;
    box-shadow: 0 0 10px #58a6ff;
  }
</style>
