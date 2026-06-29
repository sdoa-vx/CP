/**
 * @SdoaManifest
 * id: TimeMachineStore
 * type: UI_LOGIC
 * version: 1.0.0
 * description: Stores the playback state of the Chronicle Mesh Time Machine.
 * capabilities: state.manage, timeline.scrub
 * dependencies: svelte
 */
import { writable } from 'svelte/store';

export interface TimeMachineState {
  playing: boolean;
  currentIndex: number;
  events: any[];
  speed: number;
  mode: string;
}

export const timeMachineStore = writable<TimeMachineState>({
  playing: false,
  currentIndex: 0,
  events: [],
  speed: 1, // 1x, 2x, 4x
  mode: "mesh" // mesh, drift, routing, governance
});
