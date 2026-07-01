/**
 * @SdoaManifest
 * id: SvelteStores
 * type: UI_LOGIC
 * version: 1.0.0
 * description: Svelte reactive stores holding the live state of the mesh, proposals, and governance.
 * capabilities: state.manage
 * dependencies: svelte
 */
import { writable } from 'svelte/store';

export const proposalStore = writable<Record<string, any>>({});
export const lineageStore = writable<Record<string, any>>({});
export const governanceStore = writable<any[]>([]);
export const meshEffectsStore = writable<any[]>([]);
export const routingStore = writable<any[]>([]);
export const meshStore = writable<any>({});
export const pulseStore = writable<any>({});
export const driftStore = writable<any>({});
export const meshLogsStore = writable<any[]>([]);

export const scanStore = writable({
  index: 0,
  total: 0,
  file: null,
  previousFile: null,
  nextFile: null,
  percent: 0,
  active: false,
  source: 'none' as 'sse' | 'chronicle' | 'none'
});
