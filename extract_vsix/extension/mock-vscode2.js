
const MANIFEST = {
  id: "mock-vscode2.js",
  type: "module",
  layer: 4,
  runtime: "JavaScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "createOutputChannel",
    "createStatusBarItem",
    "showInformationMessage",
    "registerCommand",
    "onDidSaveTextDocument"
  ],
  dependencies: [],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

module.exports = {
  window: { 
    createOutputChannel: () => ({ appendLine: console.log }),
    createStatusBarItem: () => ({ show: () => {} }),
    showInformationMessage: () => {}
  },
  commands: { registerCommand: () => {} },
  workspace: { onDidSaveTextDocument: () => {} },
  StatusBarAlignment: { Right: 1 }
};
