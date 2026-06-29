<script lang="ts">
  import { meshStore, pulseStore, driftStore } from '$lib/state/stores';
  import { onMount } from 'svelte';
  import { initTopology } from '$lib/topology/renderer';
  import SleeveFlyout from '$lib/components/SleeveFlyout.svelte';
  
  let canvas: HTMLDivElement;
  let selectedNode: any = null;

  function handleNodeClick(e: CustomEvent) {
    selectedNode = e.detail;
  }

  onMount(() => {
    initTopology(canvas, $meshStore, $pulseStore, $driftStore);
    
    // Listen for custom nodeclick event from D3
    canvas.addEventListener('nodeclick', handleNodeClick as EventListener);
    
    return () => {
      canvas.removeEventListener('nodeclick', handleNodeClick as EventListener);
    };
  });
</script>

<div class="mesh-page">
  <h1>Living Mesh Topology</h1>
  <div bind:this={canvas} class="mesh-canvas"></div>
</div>

<SleeveFlyout node={selectedNode} on:close={() => selectedNode = null} />

<style>
  .mesh-page {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .mesh-canvas {
    flex: 1;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    overflow: hidden;
  }
</style>
