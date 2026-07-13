import * as vscode from "vscode";
import * as crypto from "crypto";
import { resolveEndpoint } from "./cloudClient";

export const MANIFEST = {
  id: "submitProposal.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "submitProposal"
  ],
  dependencies: [
    "vscode"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

export interface InnovationPayload {
  componentName?: string;
  astSignature?: string;
  detectedLayer?: string;
  proposedPath?: string;
  codeSnippet?: string;
  metadata?: Record<string, any>;
  type?: string;
  name?: string;
  source?: {
    language?: string;
    content?: string;
    path?: string;
  };
  sdoa?: {
    layer?: number;
    placement?: string;
    manifest?: any;
  };
}

export interface FispProposalEnvelope {
  proposalId: string;
  origin: "vsx-extension" | "cli" | "dashboard" | "github-action";
  timestamp: string;
  innovations: InnovationPayload[];
}

export interface SubmitResult {
  id?: string;
  status: "created" | "merged" | "error";
  error?: string;
  suggestion?: string;
}

export async function submitProposal(
  innovation: InnovationPayload
): Promise<SubmitResult> {
  try {
    const endpoint = await resolveEndpoint();
    const isCloud = endpoint.includes("tracksdoa.us");
    const urlPath = isCloud ? "/api/proposals" : "/fisp/v1/proposals";

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.toString() || "";
    const workspaceHash = workspaceFolder 
      ? crypto.createHash("sha256").update(workspaceFolder).digest("hex")
      : "unknown-workspace";

    const envelope: any = {
      proposalId: `prop-${Date.now()}`,
      origin: "vsx-extension",
      timestamp: new Date().toISOString(),
      innovations: [innovation],
    };

    const payload = isCloud 
      ? { ...envelope, workspace_hash: workspaceHash }
      : envelope;

    const response = await fetch(`${endpoint}${urlPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json: any = await response.json();

    if (!response.ok) {
      if (response.status === 409) {
        return { id: json.id, status: "merged", suggestion: json.suggestion };
      }
      return { status: "error", error: json.error || "Unknown error" };
    }

    return {
      id: json.id,
      status: json.status === "merged" ? "merged" : "created",
    };
  } catch (err: any) {
    return { status: "error", error: err.message };
  }
}
