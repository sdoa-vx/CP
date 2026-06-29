<script lang="ts">
  import { scanStore } from '../state/stores';
</script>

{#if $scanStore.active}
  <div class="meter-container">
    <div class="meter">
      <div class="bar" style="width: {$scanStore.percent}%"></div>
    </div>
    <div class="stats">
      <span class="percent">{$scanStore.percent}%</span>
      <span class="files">{$scanStore.index} / {$scanStore.total} files</span>
    </div>
  </div>
{/if}

<style>
  .meter-container {
    margin-top: 1rem;
  }
  .meter {
    height: 8px;
    background: rgba(255,255,255,0.1);
    border-radius: 4px;
    overflow: hidden;
  }
  .bar {
    height: 100%;
    background: linear-gradient(to right, #4af, #8cf);
    transition: width 0.1s linear;
  }
  .stats {
    display: flex;
    justify-content: space-between;
    margin-top: 0.5rem;
    font-size: 0.9rem;
    opacity: 0.8;
  }
</style>
