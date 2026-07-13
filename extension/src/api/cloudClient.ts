import * as vscode from "vscode";

export const MANIFEST = {
  id: "cloudClient.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.1.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "getActiveEndpoint",
    "initEndpointResolver",
    "resolveEndpoint",
    "sendTelemetryEvent"
  ],
  dependencies: [
    "vscode"
  ],
  docs: "SDOA Cloud Endpoint Resolver and Failover Client with Background Probing"
};

const CLOUD_ENDPOINT = "https://mcp.tracksdoa.us";
let cachedEndpoint: string = "http://localhost:8080";
let resolveTimer: NodeJS.Timeout | null = null;

/**
 * Returns the currently active cached endpoint synchronously.
 */
export function getActiveEndpoint(): string {
  return cachedEndpoint;
}

/**
 * Resolves whether to use the local SDOA engine or fall back to the cloud.
 * Sends a quick heartbeat check to the configured local endpoint.
 */
export async function resolveEndpoint(): Promise<string> {
  const localEndpoint = vscode.workspace
    .getConfiguration("sdoaMcp")
    .get<string>("fispEndpoint") || "http://localhost:8080";

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1200); // 1.2s timeout

    const res = await fetch(`${localEndpoint}/health`, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(id);

    if (res.ok) {
      cachedEndpoint = localEndpoint;
    } else {
      cachedEndpoint = CLOUD_ENDPOINT;
    }
  } catch (e) {
    cachedEndpoint = CLOUD_ENDPOINT;
  }

  return cachedEndpoint;
}

let lastSyncTime = 0;

/**
 * Periodically polls cloud and triggers sync of prime_export.json when connectivity is restored.
 */
export async function triggerOfflineSyncIfOnline() {
  try {
    const cloudHealth = await fetch("https://mcp.tracksdoa.us/api/health", {
      method: "GET",
      signal: AbortSignal.timeout(1500)
    });
    if (!cloudHealth.ok) return;

    const now = Date.now();
    if (now - lastSyncTime < 30000) return; // limit to every 30 seconds

    const localEndpoint = getActiveEndpoint();
    const reportRes = await fetch(`${localEndpoint}/api/prime/download-report`);
    if (!reportRes.ok) return;

    const report = await reportRes.json();
    const { callMcpTool } = await import("./mcpClient");
    await callMcpTool("sdoa.syncSummary", { report });
    lastSyncTime = now;
    console.log("[SDOA Client] Dynamic offline -> online sync complete.");
  } catch (e) {
    // Ignore network errors when offline
  }
}

/**
 * Initializes background probing to update cachedEndpoint periodically.
 */
export function initEndpointResolver() {
  if (resolveTimer) return;
  
  // Probe immediately
  resolveEndpoint().then(() => {
    triggerOfflineSyncIfOnline();
  });

  // Probe and sync every 30 seconds
  resolveTimer = setInterval(async () => {
    await resolveEndpoint();
    await triggerOfflineSyncIfOnline();
  }, 30000);
}

/**
 * Sends a telemetry event to the resolved endpoint.
 */
export async function sendTelemetryEvent(
  eventType: string,
  payload: Record<string, any>,
  workspaceHash: string
): Promise<boolean> {
  try {
    const endpoint = getActiveEndpoint();
    const isCloud = endpoint.includes("tracksdoa.us");
    const path = isCloud ? "/api/telemetry" : "/telemetry/reuse";

    const res = await fetch(`${endpoint}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: eventType,
        workspace_hash: workspaceHash,
        payload,
        extension_version: "1.5.0"
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}
