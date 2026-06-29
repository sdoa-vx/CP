<script lang="ts">
  export let beforeScores: Record<string, number>;
  export let afterScores: Record<string, number>;
  export let beforeForecast: number;
  export let afterForecast: number;

  function calculateDelta(before: number, after: number) {
    return after - before;
  }
</script>

<div class="mesh-diff">
  <div class="diff-section oracle-diff">
    <h3>Oracle Score Shifts</h3>
    <div class="score-grid">
      {#each Object.keys(afterScores) as key}
        {@const delta = calculateDelta(beforeScores[key] || 0, afterScores[key])}
        <div class="score-row">
          <span class="score-key">{key}</span>
          <span class="score-val before">{beforeScores[key] || 0}</span>
          <span class="score-arrow">→</span>
          <span class="score-val after">{afterScores[key]}</span>
          <span class="score-delta {delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'}">
            {delta > 0 ? '+' : ''}{delta}
          </span>
        </div>
      {/each}
    </div>
  </div>

  <div class="diff-section cartographer-diff">
    <h3>Cartographer Forecast Shift</h3>
    <div class="forecast-comparison">
      <div class="forecast-box before">
        <span class="label">Previous Drift</span>
        <span class="value">{beforeForecast.toFixed(2)}</span>
      </div>
      <div class="forecast-arrow">→</div>
      <div class="forecast-box after">
        <span class="label">New Drift</span>
        <span class="value">{afterForecast.toFixed(2)}</span>
      </div>
    </div>
  </div>
</div>

<style>
  .mesh-diff {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 1.5rem;
  }
  .diff-section h3 {
    margin: 0 0 1rem 0;
    font-size: 0.9rem;
    color: #8b949e;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .score-grid {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .score-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    background: #161b22;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-family: monospace;
  }
  .score-key { flex: 1; color: #c9d1d9; }
  .score-val { font-weight: bold; }
  .score-val.before { color: #8b949e; }
  .score-val.after { color: #c9d1d9; }
  .score-arrow { color: #30363d; }
  .score-delta.positive { color: #3fb950; }
  .score-delta.negative { color: #f85149; }
  .score-delta.neutral { color: #8b949e; }

  .forecast-comparison {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2rem;
  }
  .forecast-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #161b22;
    padding: 1rem 2rem;
    border-radius: 4px;
    border: 1px solid #30363d;
  }
  .forecast-box .label { font-size: 0.8rem; color: #8b949e; margin-bottom: 0.5rem; }
  .forecast-box .value { font-size: 1.5rem; font-weight: bold; color: #58a6ff; }
  .forecast-arrow { font-size: 2rem; color: #30363d; }
</style>
