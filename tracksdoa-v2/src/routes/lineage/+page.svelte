<script lang="ts">
  import { lineageStore } from '$lib/state/stores';
  import { onMount } from 'svelte';
  import { renderLineageTree } from '$lib/lineage/renderTree';

  let container: HTMLDivElement;

  $: {
    if (container && Object.keys($lineageStore).length > 0) {
      const lineageData = Object.values($lineageStore)[0]?.lineage_tree || { name: 'Root', children: [] };
      renderLineageTree(container, lineageData);
    }
  }
</script>

<div class="lineage-page">
  <h1>Lineage Tree (Registrar)</h1>
  <div bind:this={container} class="lineage-container"></div>
</div>

<style>
  .lineage-page {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .lineage-container {
    flex: 1;
    width: 100%;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    overflow: hidden;
  }
</style>
