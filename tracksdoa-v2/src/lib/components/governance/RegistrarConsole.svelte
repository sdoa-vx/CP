<script lang="ts">
  import { lineageStore } from '../../state/stores';
</script>

<div class="console registrar">
  <h1>Registrar — Lineage</h1>

  {#each Object.values($lineageStore) as lineage}
    <div class="lineage-card">
      <h2>{lineage.module_id}</h2>
      <p>Parent: {lineage.parent_module_id}</p>

      <details>
        <summary>Lineage Tree</summary>
        <pre>{JSON.stringify(lineage.lineage_tree, null, 2)}</pre>
      </details>
    </div>
  {/each}
</div>

<style>
  .console {
    padding: 1rem;
    background: rgba(0, 0, 255, 0.05);
    border: 1px solid rgba(0, 0, 255, 0.2);
    border-radius: 8px;
  }
  .lineage-card {
    margin-top: 1rem;
    padding: 1rem;
    background: rgba(255,255,255,0.05);
    border-radius: 4px;
  }
  pre {
    background: #000;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
  }
</style>
