import * as vscode from "vscode";
import { getActiveEndpoint } from "./cloudClient";

/**
 * Hybrid SDOA MCP Client that routes tool calls to local or cloud backends based on capability.
 */
export async function callMcpTool(
  toolName: string,
  args: any
): Promise<any> {
  const isCloudTool = [
    "sdoa.refineCandidate",
    "sdoa.syncSummary",
    "sdoa.canonicalizeModule",
    "sdoa.generateManifest",
    "sdoa.clusterFragments",
    "sdoa.createPullRequest",
    "sdoa.getCanonicalLibrary",
    "sdoa.scoreCompliance",
    "sdoa.getLineageTree",
    "sdoa.multiRefine"
  ].includes(toolName);

  if (isCloudTool) {
    const cloudEndpoint = "https://mcp.tracksdoa.us/mcp";
    // Fetch the shared secret from user configurations
    const sharedSecret = vscode.workspace.getConfiguration("sdoaMcp").get<string>("sharedSecret") || "shared-mcp-secret";

    const response = await fetch(cloudEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sharedSecret}`
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: toolName, arguments: args },
        id: Date.now()
      })
    });

    if (!response.ok) {
      throw new Error(`Cloud MCP request failed: ${response.statusText}`);
    }

    const json: any = await response.json();
    if (json.error) {
      throw new Error(json.error.message);
    }
    return json.result;
  } else {
    // Local tool execution via existing server routes
    const localEndpoint = getActiveEndpoint();
    let urlPath = "";
    let bodyPayload = args;

    if (toolName === "sdoa.scanProject" || toolName === "sdoa.scanWorkspace") {
      urlPath = "/dashboard/api/actions/scan-workspace";
      bodyPayload = { workspaceRoot: args.workspaceRoot || "" };
    } else {
      urlPath = `/api/prime/${toolName.replace("sdoa.", "")}`;
    }

    const authConfig = vscode.workspace.getConfiguration("sdoaMcp");
    const u = authConfig.get<string>("adminUser") || "admin";
    const p = authConfig.get<string>("adminPass") || "admin";
    const basicAuth = btoa(`${u}:${p}`);

    const response = await fetch(`${localEndpoint}${urlPath}`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": "Basic " + basicAuth
      },
      body: JSON.stringify(bodyPayload)
    });

    if (!response.ok) {
      throw new Error(`Local MCP request failed: ${response.statusText}`);
    }

    return response.json();
  }
}
