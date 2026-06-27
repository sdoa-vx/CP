import WebSocket, { WebSocketServer } from 'ws';

let extensionSocket: WebSocket | null = null;

export function startVscodeBridge(port = 7337) {
  const wss = new WebSocketServer({ port });

  console.log(`[SDOA] VSCode Bridge listening on ws://localhost:${port}`);

  wss.on('connection', (socket) => {
    console.log('[SDOA] VSCode extension connected');
    extensionSocket = socket;

    socket.on('close', () => {
      console.log('[SDOA] VSCode extension disconnected');
      extensionSocket = null;
    });

    socket.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        handleExtensionMessage(data);
      } catch (err) {
        console.error('[SDOA] Invalid message from extension:', err);
      }
    });
  });
}

export function sendToExtension(event: string, payload: any) {
  if (!extensionSocket || extensionSocket.readyState !== WebSocket.OPEN) {
    return;
  }

  extensionSocket.send(JSON.stringify({ event, payload }));
}

import { watchWorkspace } from '../engine/cognizance/fileWatcher';
import { revertExtraction } from '../engine/extraction/revertExtractionEngine';
import { queryExtractionEvents } from '../engine/extraction/extractionEventQuery';
import { aggregateExtractionData } from '../engine/extraction/extractionAggregationEngine';

async function triggerExtractionAnalyticsSync() {
  try {
    const events = await queryExtractionEvents({ limit: 500 });
    await aggregateExtractionData(events);
    console.log('[SDOA] Extraction analytics synced.');
  } catch (err) {
    console.error('[SDOA] Error syncing extraction analytics:', err);
  }
}

function handleExtensionMessage(msg: any) {
  switch (msg.event) {
    case 'extension:ready':
      console.log('[SDOA] Extension reports ready with workspace:', msg.payload.workspaceRoot);
      if (msg.payload.workspaceRoot) {
        watchWorkspace(msg.payload.workspaceRoot);
      }
      triggerExtractionAnalyticsSync();
      break;

    case 'extension:requestCognizanceRefresh':
      // Trigger full re-analysis if needed
      triggerExtractionAnalyticsSync();
      break;

    case 'extraction:revert':
      try {
        revertExtraction(msg.payload);
        console.log('[SDOA] Extraction reverted successfully for:', msg.payload.file);
      } catch (err) {
        console.error('[SDOA] Error reverting extraction:', err);
      }
      break;
      break;

    default:
      console.log('[SDOA] Unknown extension event:', msg.event);
  }
}
