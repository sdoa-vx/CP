import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
// @ts-ignore
import { createSdoaModule } from '../../../server/src/engine/sdoaFileApi';

export async function extractWorkflow(hits: any[]) {
  for (const hit of hits) {
    const { filePath, fetchSnippet, name } = hit;

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const targetDir = path.join(workspaceRoot, 'server', 'workflows');
    const targetFile = path.join(targetDir, `${name}.ts`);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const codeBody = [
      `export async function ${name}(params?: any) {`,
      `  ${fetchSnippet}`,
      `}`
    ].join("\n");

    await createSdoaModule({
      type: "workflow",
      id: name,
      description: "Extracted by SDOA Innovation Detector",
      changeSummary: "Initial extraction",
      codeBody: codeBody,
      dependencies: []
    });

    if (fs.existsSync(filePath)) {
      const original = fs.readFileSync(filePath, 'utf8');
      let updated = "";
      let addedSnippet = "";

      if (fetchSnippet === original) {
        addedSnippet = `// SDOA EXTRACTED: await ${name}()\n// TODO: Import ${name}\n`;
        updated = addedSnippet + original;
      } else {
        addedSnippet = `await ${name}() /* TODO: Add import */`;
        updated = original.replace(fetchSnippet, addedSnippet);
      }

      // Instead of writing the file immediately, trigger the Extraction Diff Panel!
      vscode.commands.executeCommand("sdoa.showExtractionDiff", {
        file: filePath,
        removed: [fetchSnippet],
        added: [addedSnippet],
        unifiedDiff: `- ${fetchSnippet}\n+ ${addedSnippet}`,
        modulePath: targetFile,
        moduleSource: codeBody,
        originalSource: original,
        header: `Extracted ${name} (workflow)`
      });
    }
  }
}
