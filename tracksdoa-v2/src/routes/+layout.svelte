<script lang="ts">
  import { onMount } from 'svelte';
  import { initRealtime } from '$lib/supabase/subscriptions';
  import { page } from '$app/stores';

  onMount(() => {
    initRealtime();
  });

  const modes = [
    { href: '/mesh', label: 'Mesh View', icon: '🌐' },
    { href: '/governance', label: 'Governance View', icon: '⚖️' },
    { href: '/timeline', label: 'Innovation View', icon: '⏱️' },
    { href: '/scan', label: 'Scan View', icon: '🔍' },
    { href: '/lineage', label: 'Lineage View', icon: '🧬' },
    { href: '/drift', label: 'Drift View', icon: '📈' },
    { href: '/time-machine', label: 'Time Machine', icon: '⏱️' },
    // Keep proposals around just in case we need a direct path
    { href: '/proposals', label: 'Proposals (Legacy)', icon: '📝' }
  ];
</script>

<nav class="sidebar">
  <div class="logo">
    SDOA <span>V2</span>
  </div>
  <div class="mode-header">Mode Switch</div>
  <ul>
    {#each modes as mode}
      <li>
        <a href={mode.href} class:active={$page.url.pathname.startsWith(mode.href)}>
          <span class="icon">{mode.icon}</span>
          <span class="label">{mode.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>

<main class="content">
  <slot />
</main>

<style>
  :global(body) {
    display: flex;
    margin: 0;
    height: 100vh;
    overflow: hidden;
  }
  .sidebar {
    width: 250px;
    background: #161b22;
    border-right: 1px solid #30363d;
    display: flex;
    flex-direction: column;
  }
  .logo {
    padding: 1.5rem;
    font-size: 1.5rem;
    font-weight: bold;
    color: white;
    border-bottom: 1px solid #30363d;
  }
  .logo span {
    color: #58a6ff;
  }
  .mode-header {
    padding: 1rem 1.5rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    color: #8b949e;
    letter-spacing: 1px;
    font-weight: 600;
  }
  .sidebar ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .sidebar li a {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1.5rem;
    color: #c9d1d9;
    text-decoration: none;
    transition: background 0.2s;
  }
  .sidebar li a .icon {
    font-size: 1.1rem;
    width: 20px;
    text-align: center;
  }
  .sidebar li a:hover {
    background: #21262d;
  }
  .sidebar li a.active {
    background: #1f6feb;
    color: white;
    font-weight: bold;
  }
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 2rem;
    background: #0d1117;
  }
</style>
