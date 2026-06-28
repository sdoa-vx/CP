// ------------------------------------------------------------------
// File:    extractionDiffCommands.ts
// Version: 1.1.0
// Updated: 2026-06-23T16:30:00.000Z
// Changes: Added applyInjector, openExtractedModule, revertExtraction, toggleDiffMode
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "extension.commands.extractionDiff",
  type: "engine",
  layer: "application",
  runtime: "browser",
  version: "1.1.0",
  action_surface: ["ui.command.diff"],
  commands: [
    "showExtractionDiff",
    "applyInjector",
    "openExtractedModule",
    "revertExtraction",
    "toggleDiffMode"
  ],
  events: [],
  accepts: [],
  slots: [],
  dependencies: ["extension.ui.extractionDiffPanel"],
  sovereign_lineage: "extension.commands.extractionDiff",
  variant_of: null,
  docs: {
    description: "Registers VS Code commands for SDOA extraction diff interactions.",
    last_modified: "2026-06-23T16:30:00.000Z"
  }
} as const;

import * as vscode from "vscode";
import { showExtractionDiffPanel } from "../ui/extractionDiffPanel";

export function registerExtractionDiffCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("sdoa.showExtractionDiff", (payload) => {
      showExtractionDiffPanel(context, payload);
    }),

    vscode.commands.registerCommand("sdoa.applyInjector", async (payload) => {
      // Backend should already have applied changes; here you could trigger a refresh or show a toast.
      vscode.window.showInformationMessage("Injector applied to " + payload.file);
    }),

    vscode.commands.registerCommand("sdoa.openExtractedModule", async ({ modulePath }) => {
      const doc = await vscode.workspace.openTextDocument(modulePath);
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    }),

    vscode.commands.registerCommand("sdoa.revertExtraction", async (payload) => {
      vscode.commands.executeCommand("sdoa.backend.revertExtraction", payload);
      vscode.window.showInformationMessage("Reverted extraction for " + payload.file);
    }),

    vscode.commands.registerCommand("sdoa.toggleDiffMode", async ({ mode, file }) => {
      vscode.window.showInformationMessage(`Diff mode for ${file} set to: ${mode}`);
    })
  );
}
