<script lang="ts">
  import CoachConsole from './governance/CoachConsole.svelte';
  import RegistrarConsole from './governance/RegistrarConsole.svelte';
  import ProbationConsole from './governance/ProbationConsole.svelte';
  import OracleConsole from './governance/OracleConsole.svelte';
  import CartographerConsole from './governance/CartographerConsole.svelte';

  export let active: string = '';
</script>

{#if active === 'coach'} <CoachConsole /> {/if}
{#if active === 'registrar'} <RegistrarConsole /> {/if}
{#if active === 'probation'} <ProbationConsole /> {/if}
{#if active === 'oracle'} <OracleConsole /> {/if}
{#if active === 'cartographer'} <CartographerConsole /> {/if}
