import * as vscode from "vscode";
export interface InnovationPayload {
  componentName?: string;
  astSignature?: string;
  detectedLayer?: string;
  proposedPath?: string;
  codeSnippet?: string;
  metadata?: Record<string, any>;
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
    const endpoint = vscode.workspace
      .getConfiguration("sdoaMcp")
      .get<string>("fispEndpoint");

    if (!endpoint) {
      throw new Error("Missing MCP FISP endpoint in settings.");
    }

    const envelope: FispProposalEnvelope = {
      proposalId: `prop-${Date.now()}`,
      origin: "vsx-extension",
      timestamp: new Date().toISOString(),
      innovations: [innovation],
    };

    const response = await fetch(`${endpoint}/fisp/v1/proposals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
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
