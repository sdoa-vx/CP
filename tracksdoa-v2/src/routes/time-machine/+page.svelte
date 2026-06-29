<script lang="ts">
  import { onMount } from 'svelte';
  import { timeMachineStore } from '$lib/state/timeMachineStore';
  import { loadRecentChronicle } from '$lib/timeMachine/loadChronicle';
  import { togglePlayback, setPlaybackSpeed, scrubTo } from '$lib/timeMachine/playbackEngine';
  import TransportVisualizer from '$lib/components/TransportVisualizer.svelte';
  import BatchFlowPanel from '$lib/components/BatchFlowPanel.svelte';

  onMount(async () => {
    const events = await loadRecentChronicle(500);
    timeMachineStore.update(s => ({ ...s, events, currentIndex: 0 }));
  });

  $: currentEvent = $timeMachineStore.events[$timeMachineStore.currentIndex];
  $: progress = $timeMachineStore.events.length > 1 
      ? ($timeMachineStore.currentIndex / ($timeMachineStore.events.length - 1)) * 100 
      : 0;

  function handleScrub(e: Event) {
    const target = e.target as HTMLInputElement;
    scrubTo(parseInt(target.value, 10));
  }
</script>

<div class="time-machine">
  <div class="header">
    <h1>Chronicle Time Machine</h1>
    <div class="controls">
      <button class="play-btn" on:click={togglePlayback}>
        {$timeMachineStore.playing ? '⏸ Pause' : '▶ Play'}
      </button>
      <select 
        class="speed-select" 
        value={$timeMachineStore.speed} 
        on:change={(e) => setPlaybackSpeed(parseFloat(e.currentTarget.value))}
      >
        <option value={0.5}>0.5x</option>
        <option value={1}>1x</option>
        <option value={2}>2x</option>
        <option value={4}>4x</option>
        <option value={10}>10x</option>
      </select>
      <div class="view-toggles">
        {#each ['mesh', 'drift', 'routing', 'governance'] as mode}
          <button 
            class="toggle-btn" 
            class:active={$timeMachineStore.mode === mode}
            on:click={() => timeMachineStore.update(s => ({ ...s, mode }))}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="scrubber-container">
    <input 
      type="range" 
      min="0" 
      max={$timeMachineStore.events.length - 1} 
      value={$timeMachineStore.currentIndex}
      on:input={handleScrub}
      class="scrubber"
    />
    <div class="progress-bar" style="width: {progress}%"></div>
    <div class="scrubber-labels">
      <span>{ $timeMachineStore.events.length > 0 ? new Date($timeMachineStore.events[0].timestamp).toLocaleTimeString() : 'Start' }</span>
      <span>{ currentEvent ? new Date(currentEvent.timestamp).toLocaleTimeString() : 'Now' }</span>
      <span>{ $timeMachineStore.events.length > 0 ? new Date($timeMachineStore.events[$timeMachineStore.events.length - 1].timestamp).toLocaleTimeString() : 'End' }</span>
    </div>
  </div>

  <div class="playback-viewer">
    {#if !currentEvent}
      <div class="loading">Loading Chronicle History...</div>
    {:else}
      <div class="event-details">
        <h2>Event: {currentEvent.type || 'Unknown'}</h2>
        <pre>{JSON.stringify(currentEvent.payload, null, 2)}</pre>
      </div>

      {#if $timeMachineStore.mode === 'routing'}
        <div class="visualizer-panel">
          <TransportVisualizer event={currentEvent} />
        </div>
      {:else if $timeMachineStore.mode === 'mesh'}
        <div class="visualizer-panel">
          <BatchFlowPanel event={currentEvent} />
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .time-machine {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 1.5rem;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #161b22;
    padding: 1rem 1.5rem;
    border: 1px solid #30363d;
    border-radius: 8px;
  }
  .header h1 { margin: 0; font-size: 1.5rem; }
  .controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .play-btn {
    background: #238636;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-weight: bold;
    cursor: pointer;
  }
  .play-btn:hover { background: #2ea043; }
  .speed-select {
    background: #0d1117;
    color: #c9d1d9;
    border: 1px solid #30363d;
    padding: 0.5rem;
    border-radius: 4px;
  }
  .view-toggles {
    display: flex;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 4px;
    overflow: hidden;
  }
  .toggle-btn {
    background: transparent;
    border: none;
    color: #8b949e;
    padding: 0.5rem 1rem;
    cursor: pointer;
    border-right: 1px solid #30363d;
  }
  .toggle-btn:last-child { border-right: none; }
  .toggle-btn:hover { background: #21262d; color: #c9d1d9; }
  .toggle-btn.active {
    background: #1f6feb;
    color: white;
    font-weight: bold;
  }
  
  .scrubber-container {
    position: relative;
    background: #161b22;
    padding: 1rem 1.5rem;
    border: 1px solid #30363d;
    border-radius: 8px;
  }
  .scrubber {
    width: 100%;
    cursor: pointer;
    z-index: 2;
    position: relative;
    opacity: 0;
  }
  .progress-bar {
    position: absolute;
    top: 1rem;
    left: 1.5rem;
    height: 6px;
    background: #58a6ff;
    border-radius: 3px;
    z-index: 1;
    pointer-events: none;
  }
  .scrubber-container::before {
    content: '';
    position: absolute;
    top: 1rem;
    left: 1.5rem;
    right: 1.5rem;
    height: 6px;
    background: #30363d;
    border-radius: 3px;
    z-index: 0;
  }
  .scrubber-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 0.5rem;
    font-size: 0.8rem;
    color: #8b949e;
    font-family: monospace;
  }

  .playback-viewer {
    flex: 1;
    display: flex;
    gap: 1.5rem;
    overflow: hidden;
  }
  .event-details, .visualizer-panel {
    flex: 1;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.5rem;
    overflow-y: auto;
  }
  .event-details pre {
    background: #0d1117;
    padding: 1rem;
    border-radius: 4px;
    color: #8b949e;
    font-size: 0.85rem;
  }
</style>
