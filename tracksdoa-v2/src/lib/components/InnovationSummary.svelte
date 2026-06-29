<script lang="ts">
  import { proposalStore } from '../state/stores';
</script>

<div class="innovation-summary">
  <h2>Innovation Summary</h2>

  {#if Object.keys($proposalStore).length === 0}
    <p>No innovations detected in this scan.</p>
  {:else}
    <ul>
      {#each Object.values($proposalStore) as proposal}
        <li>
          <strong>{proposal.module_suggestion}</strong>
          <span class="state {proposal.state}"> → {proposal.state}</span>
          <div class="reason">{proposal.reasoning}</div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .innovation-summary {
    background: rgba(255, 255, 255, 0.05);
    padding: 1rem;
    border-radius: 8px;
  }
  ul {
    list-style: none;
    padding: 0;
  }
  li {
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }
  .reason {
    opacity: 0.8;
    margin-top: 0.5rem;
    font-size: 0.9rem;
  }
  .state {
    font-weight: bold;
    text-transform: uppercase;
    font-size: 0.8rem;
  }
  .state.pending { color: gold; }
  .state.approved { color: limegreen; }
  .state.rejected { color: tomato; }
</style>
