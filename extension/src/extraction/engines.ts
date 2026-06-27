import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export async function extractEngine(hits: any[]) {
  for (const hit of hits) {
    const { filePath, spawnSnippet, name } = hit;

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const targetDir = path.join(workspaceRoot, 'substrate', 'engines');
    const targetFile = path.join(targetDir, `${name}.ts`);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const engineCode = [
      "export const MANIFEST = {",
      `  id: "${name}.engine",`,
      `  type: "engine",`,
      `  layer: 4,`,
      `  runtime: "TypeScript",`,
      `  version: "1.0.0",`,
      `  operationalRole: "detected-innovation",`,
      `  optimization: { priority: "speed" },`,
      `  docs: "Extracted by SDOA Innovation Detector"`,
      "};\n",
      "import { spawn, exec } from 'child_process';",
      "",
      `export async function ${name}(args?: any) {`,
      `  ${spawnSnippet}`,
      `}`
    ].join("\n");

    fs.writeFileSync(targetFile, engineCode);

    if (fs.existsSync(filePath)) {
      const original = fs.readFileSync(filePath, 'utf8');
      let updated = "";
      let addedSnippet = "";

      if (spawnSnippet === original) {
        addedSnippet = `// SDOA EXTRACTED: await ${name}()\n// TODO: Import ${name}\n`;
        updated = addedSnippet + original;
      } else {
        addedSnippet = `await ${name}() /* TODO: Add import */`;
        updated = original.replace(spawnSnippet, addedSnippet);
      }

      vscode.commands.executeCommand("sdoa.showExtractionDiff", {
        file: filePath,
        removed: [spawnSnippet],
        added: [addedSnippet],
        unifiedDiff: `- ${spawnSnippet}\n+ ${addedSnippet}`,
        modulePath: targetFile,
        moduleSource: engineCode,
        originalSource: original,
        header: `Extracted ${name} (engine)`
      });
    }
  }
}
