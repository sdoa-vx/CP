<script lang="ts">
  import { governanceStore } from '../state/stores';
  import { animateSigil } from '../animation/sigilGlow';

  const sigils = {
    coach: { color: 'gold', icon: 'compass' },
    registrar: { color: 'blue', icon: 'tree' },
    probation: { color: 'red', icon: 'shield' },
    oracle: { color: 'white', icon: 'eye' },
    cartographer: { color: 'green', icon: 'grid' }
  };
</script>

<div class="sigil-panel">
  {#each Object.entries(sigils) as [key, sigil]}
    {@const active = $governanceStore.some(e => e.authority === key)}
    <div class="sigil"
      style="--color: {sigil.color};"
      class:active={active}
      use:animateSigil={{ active }}
    >
      <span class="icon">{sigil.icon}</span>
      <span class="label">{key}</span>
    </div>
  {/each}
</div>

<style>
  .sigil-panel {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: rgba(0,0,0,0.2);
    border-radius: 8px;
  }
  .sigil {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    border-radius: 8px;
    background: rgba(255,255,255,0.05);
    transition: background 0.2s;
  }
  .sigil.active {
    background: rgba(255,255,255,0.1);
  }
  .icon {
    font-size: 1.5rem;
    text-transform: uppercase;
  }
  .label {
    font-size: 0.8rem;
    opacity: 0.8;
  }
</style>
