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
  innovation: any
): Promise<"local" | "submit" | "exclude" | undefined> {
  const layer = innovation.sdoa?.layer ?? innovation.layer ?? "unknown";
  const confidence = innovation.metrics?.confidence ?? innovation.confidence ?? 0;
  const usageCount = innovation.metrics?.usageCount ?? innovation.usageCount ?? 0;

  const msg = [
    "⭐ SDOA Portfolio Expansion Opportunity",
    "",
    `The SDOA Innovation Detector has identified a reusable pattern: ${innovation.name}`,
    `Type: ${innovation.type} (Layer ${layer})`,
    `Heuristic Confidence: ${Math.round(confidence * 100)}%`,
    `Occurrences: ${usageCount}`,
    "",
    "This module is eligible for voluntary contribution to the global SDOA Asset Portfolio.",
  ].join("\n");

  const choice = await vscode.window.showInformationMessage(
    msg,
    { modal: true },
    "Save locally only",
    "Submit to the Federated Sync Network (FISP)",
    "Skip — mark as local-sovereign"
  );

  if (choice === "Save locally only") return "local";
  if (choice === "Submit to the Federated Sync Network (FISP)") return "submit";
  if (choice === "Skip — mark as local-sovereign") return "exclude";
}
