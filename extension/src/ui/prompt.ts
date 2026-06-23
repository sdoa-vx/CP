import * as vscode from "vscode";

export const MANIFEST = {
  id: "prompt.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "showInnovationPrompt"
  ],
  dependencies: [
    "vscode"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};



export interface InnovationSummary {
  name: string;
  type: string;
  layer: number;
  confidence: number;
  usageCount: number;
}

export async function showInnovationPrompt(
  innovation: InnovationSummary
): Promise<"local" | "submit" | "exclude" | undefined> {
  const msg = [
    "⭐ SDOA Portfolio Expansion Opportunity",
    "",
    `The SDOA Innovation Detector has identified a reusable pattern: ${innovation.name}`,
    `Type: ${innovation.type} (Layer ${innovation.layer})`,
    `Heuristic Confidence: ${Math.round(innovation.confidence * 100)}%`,
    `Occurrences: ${innovation.usageCount}`,
    "",
    "This module is eligible for voluntary contribution to the global SDOA Asset Portfolio.",
  ].join("\n");

  const choice = await vscode.window.showInformationMessage(
    msg,
    { modal: true },
    "Save locally only",
    "Submit to FISP",
    "Exclude from future checks"
  );

  if (choice === "Save locally only") return "local";
  if (choice === "Submit to FISP") return "submit";
  if (choice === "Exclude from future checks") return "exclude";
}
