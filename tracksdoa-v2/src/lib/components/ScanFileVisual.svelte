<script lang="ts">
  import { scanStore } from '../state/stores';
</script>

<div class="scan-box">
  <div class="prev dim">{$scanStore.previousFile || '...'}</div>
  <div class="current bright">{$scanStore.file || '...'}</div>
  <div class="next dim">{$scanStore.nextFile || '...'}</div>
</div>

<style>
  .scan-box {
    font-family: monospace;
    padding: 1rem;
    border-radius: 6px;
    background: rgba(255,255,255,0.05);
    backdrop-filter: blur(4px);
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .bright { opacity: 1; font-weight: bold; color: #4af; }
  .dim { opacity: 0.4; }
</style>
