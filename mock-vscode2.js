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
