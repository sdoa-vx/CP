<script lang="ts">
import { onMount } from 'svelte';
  import { initSupabase } from '$lib/supabase/client';
  import { initRealtime } from '$lib/supabase/subscriptions';
  import { initScanChannel } from '$lib/state/scanChannel';
  import { initProposalChannel } from '$lib/state/proposalChannel';
  import { page } from '$app/stores';
  import { base } from '$app/paths';

  onMount(() => {
    let stopScanChannel: (() => void) | undefined;
    let stopProposalChannel: (() => void) | undefined;

    const setup = async () => {
      try {
        const configRes = await fetch(`${base}/api/config/get`);
        if (configRes.ok) {
          const config = await configRes.json();
          if (config.supabaseUrl && config.supabaseKey) {
            initSupabase(config.supabaseUrl, config.supabaseKey);
            initRealtime();
          }
        }
      } catch (err) {
        console.error("Failed to load backend config for Supabase:", err);
      }

      // Initialize channels (loads initial list of proposals and opens SSE event source)
      stopScanChannel = initScanChannel();
      initProposalChannel().then(stop => { stopProposalChannel = stop; });
    };

    setup();

    return () => {
      stopScanChannel?.();
      stopProposalChannel?.();
    };
  });



  const modes = [
    { href: `${base}/`, label: 'Control Center', icon: '🏠' },
    { href: `${base}/mesh`, label: 'Mesh View', icon: '🌐' },
    { href: `${base}/governance`, label: 'Governance View', icon: '⚖️' },
    { href: `${base}/timeline`, label: 'Innovation View', icon: '⏱️' },
    { href: `${base}/scan`, label: 'Scan View', icon: '🔍' },
    { href: `${base}/lineage`, label: 'Lineage View', icon: '🧬' },
    { href: `${base}/drift`, label: 'Drift View', icon: '📈' },
    { href: `${base}/time-machine`, label: 'Time Machine', icon: '⏱️' },
    // Keep proposals around just in case we need a direct path
    { href: `${base}/proposals`, label: 'Proposals (Legacy)', icon: '📝' }
  ];

  let triggerStatus = '';
  
  async function triggerCommand(command: string) {
    triggerStatus = `Triggering ${command.replace('sdoa.', '')}...`;
    try {
      const res = await fetch(`${base}/api/actions/vscode-command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      });
      if (!res.ok) {
        console.error('Command failed', await res.text());
        triggerStatus = `Failed to trigger ${command}`;
      } else {
        triggerStatus = `Triggered ${command.replace('sdoa.', '')} ✓`;
      }
    } catch (err) {
      console.error('Error triggering command', err);
      triggerStatus = `Error triggering ${command}`;
    }
    setTimeout(() => { triggerStatus = ''; }, 3000);
  }
</script>

<nav class="sidebar">
  <div class="logo">
    SDOA <span>V2</span>
  </div>
  <div class="mode-header">Mode Switch</div>
  <ul>
    {#each modes as mode}
      <li>
        <a href={mode.href} class:active={$page.url.pathname === mode.href || (mode.href !== `${base}/` && $page.url.pathname.startsWith(mode.href))}>
          <span class="icon">{mode.icon}</span>
          <span class="label">{mode.label}</span>
        </a>
      </li>
    {/each}
  </ul>
  
  <div class="mode-header" style="margin-top: 1rem;">Action Triggers</div>
  <ul class="actions-list">
    <li><button on:click={() => triggerCommand('sdoa.scanActiveFile')} title="Scan the currently active file in VS Code"><span class="icon">📄</span> Scan File</button></li>
    <li><button on:click={() => triggerCommand('sdoa.scanFolder')} title="Prompt VS Code to pick a folder to scan"><span class="icon">📂</span> Scan Folder...</button></li>
    <li><button on:click={() => triggerCommand('sdoa.scanWorkspace')} title="Scan the entire workspace"><span class="icon">📦</span> Scan Workspace</button></li>
    <li><button on:click={() => triggerCommand('sdoa.restartEngine')} title="Restart the SDOA Engine"><span class="icon">🔄</span> Reload Engine</button></li>
    <li><button on:click={() => triggerCommand('sdoa.runMigration')} title="Run DB Migrations / Reconnect"><span class="icon">🔌</span> Reconnect DB</button></li>
  </ul>
  {#if triggerStatus}
    <div class="trigger-status">{triggerStatus}</div>
  {/if}
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
  .actions-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .actions-list li button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1.5rem;
    color: #c9d1d9;
    background: none;
    border: none;
    width: 100%;
    text-align: left;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
  }
  .actions-list li button .icon {
    font-size: 1.1rem;
    width: 20px;
    text-align: center;
  }
  .actions-list li button:hover {
    background: #21262d;
  }
  .trigger-status {
    margin: 1rem 1.5rem;
    padding: 0.5rem;
    font-size: 0.85rem;
    color: #3fb950;
    background: #21262d;
    border-radius: 4px;
    text-align: center;
    border: 1px solid #30363d;
  }
</style>
