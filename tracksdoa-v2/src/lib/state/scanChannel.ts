/**
 * @SdoaManifest
 * id: ScanChannel
 * type: UI_LOGIC
 * version: 1.0.0
 * description: Dual-channel scan telemetry client - SSE primary, Chronicle-backed polling fallback.
 * capabilities: scan.progress.stream, scan.progress.fallback
 * dependencies: svelte
 */
import { base } from '$app/paths';
import { scanStore } from './stores';

const FALLBACK_POLL_MS = 2000;
const ERROR_THRESHOLD = 2;

let pollInterval: ReturnType<typeof setInterval> | null = null;
let consecutiveErrors = 0;

function startFallbackPoll() {
  if (pollInterval) return;
  scanStore.update(s => ({ ...s, source: 'chronicle' }));

  const pollOnce = async () => {
    try {
      const res = await fetch(`${base}/api/chronicle/scan-status`);
      if (!res.ok) return;
      const data = await res.json();
      scanStore.update(s => ({
        ...s,
        active: !!data.active,
        source: 'chronicle'
      }));
    } catch {
      // stay in fallback mode, try again next tick
    }
  };

  pollOnce();
  pollInterval = setInterval(pollOnce, FALLBACK_POLL_MS);
}

function stopFallbackPoll() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

export function initScanChannel() {
  const es = new EventSource(`${base}/api/events?stream=true`);

  es.addEventListener('open', () => {
    consecutiveErrors = 0;
    stopFallbackPoll();
    scanStore.update(s => ({ ...s, source: 'sse' }));
  });

  es.addEventListener('scan:start', () => {
    scanStore.set({
      index: 0,
      total: 0,
      file: null,
      previousFile: null,
      nextFile: null,
      percent: 0,
      active: true,
      source: 'sse'
    });
  });

  es.addEventListener('scan:progress', (event: MessageEvent) => {
    try {
      const { payload } = JSON.parse(event.data);
      scanStore.update(s => ({
        ...s,
        index: payload.scannedCount ?? s.index,
        total: payload.totalFiles ?? s.total,
        previousFile: s.file,
        file: payload.currentFile ?? null,
        percent: payload.totalFiles ? Math.round((payload.scannedCount / payload.totalFiles) * 100) : s.percent,
        active: true,
        source: 'sse'
      }));
    } catch { /* ignore malformed event */ }
  });

  es.addEventListener('scan:complete', () => {
    scanStore.update(s => ({ ...s, active: false, percent: 100, source: 'sse' }));
  });

  es.addEventListener('error', () => {
    consecutiveErrors++;
    // Native EventSource already auto-reconnects on transient blips - only fall back
    // once it's given up (readyState CLOSED) after a couple of consecutive failures,
    // so a single hiccup doesn't downgrade the whole session to slow polling.
    if (es.readyState === EventSource.CLOSED && consecutiveErrors >= ERROR_THRESHOLD) {
      startFallbackPoll();
    }
  });

  return () => {
    es.close();
    stopFallbackPoll();
  };
}
