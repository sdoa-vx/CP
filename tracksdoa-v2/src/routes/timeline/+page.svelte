<script lang="ts">
  import { proposalStore } from '$lib/state/stores';

  // Derived sorted proposals
  $: sortedProposals = Object.values($proposalStore).sort((a, b) => {
    return new Date(b.created_at || Date.now()).getTime() - new Date(a.created_at || Date.now()).getTime();
  });
</script>

<div class="timeline-page">
  <h1>Innovation Timeline</h1>
  
  <div class="timeline-container">
    {#if sortedProposals.length === 0}
      <div class="empty-state">No innovation proposals yet.</div>
    {:else}
      <ul class="timeline">
        {#each sortedProposals as event (event.id)}
          <li class="timeline-event">
            <div class="event-marker"></div>
            <div class="event-content" class:merged={event.status === 'merged'} class:pending={event.status === 'pending'}>
              <div class="event-header">
                <strong>{event.type.toUpperCase()}: {event.name || event.id}</strong>
                <span class="status {event.status}">{event.status}</span>
              </div>
              <div class="event-body">
                <p>Lineage: {event.lineage || 'Orphan'}</p>
                <small class="time">{new Date(event.created_at).toLocaleString()}</small>
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .timeline-page {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .timeline-container {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 0;
  }
  .empty-state {
    color: #8b949e;
    font-style: italic;
  }
  .timeline {
    list-style: none;
    padding: 0;
    margin: 0;
    position: relative;
  }
  .timeline::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 15px;
    width: 2px;
    background: #30363d;
  }
  .timeline-event {
    position: relative;
    padding-left: 40px;
    margin-bottom: 2rem;
  }
  .event-marker {
    position: absolute;
    left: 11px;
    top: 5px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #58a6ff;
    box-shadow: 0 0 0 4px #0d1117;
  }
  .event-content {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1rem;
    transition: border-color 0.2s;
  }
  .event-content.merged {
    border-left: 4px solid #3fb950;
  }
  .event-content.pending {
    border-left: 4px solid #d29922;
  }
  .event-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  .status {
    font-size: 0.75rem;
    padding: 2px 6px;
    border-radius: 12px;
    font-weight: bold;
    text-transform: uppercase;
  }
  .status.merged { background: rgba(63, 185, 80, 0.1); color: #3fb950; }
  .status.pending { background: rgba(210, 153, 34, 0.1); color: #d29922; }
  .status.rejected { background: rgba(248, 81, 73, 0.1); color: #f85149; }
  
  .event-body p { margin: 0 0 0.5rem; color: #c9d1d9; }
  .event-body .time { color: #8b949e; }
</style>
