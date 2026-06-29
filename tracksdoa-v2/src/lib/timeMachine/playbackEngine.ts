/**
 * @SdoaManifest
 * id: PlaybackEngine
 * type: UI_LOGIC
 * version: 1.0.0
 * description: Engine to drive the Chronicle Time Machine playback loop.
 * capabilities: timeline.play, timeline.pause
 * dependencies: svelte
 */
import { get } from 'svelte/store';
import { timeMachineStore } from '../state/timeMachineStore';

let playbackInterval: ReturnType<typeof setInterval> | null = null;

export function togglePlayback() {
  const state = get(timeMachineStore);
  if (state.playing) {
    pausePlayback();
  } else {
    startPlayback();
  }
}

export function startPlayback() {
  timeMachineStore.update(s => ({ ...s, playing: true }));
  
  if (playbackInterval) clearInterval(playbackInterval);
  
  const tick = () => {
    timeMachineStore.update(state => {
      if (!state.playing) return state;
      
      let nextIndex = state.currentIndex + 1;
      
      // Auto-pause at end
      if (nextIndex >= state.events.length) {
        nextIndex = state.events.length - 1;
        pausePlayback();
      }
      
      return { ...state, currentIndex: nextIndex };
    });
  };
  
  const state = get(timeMachineStore);
  const delay = 1000 / state.speed; 
  playbackInterval = setInterval(tick, delay);
}

export function pausePlayback() {
  timeMachineStore.update(s => ({ ...s, playing: false }));
  if (playbackInterval) {
    clearInterval(playbackInterval);
    playbackInterval = null;
  }
}

export function setPlaybackSpeed(speed: number) {
  timeMachineStore.update(s => ({ ...s, speed }));
  const state = get(timeMachineStore);
  if (state.playing) {
    // Restart interval with new speed
    pausePlayback();
    startPlayback();
  }
}

export function scrubTo(index: number) {
  timeMachineStore.update(s => {
    let safeIndex = Math.max(0, Math.min(index, s.events.length - 1));
    return { ...s, currentIndex: safeIndex };
  });
}
