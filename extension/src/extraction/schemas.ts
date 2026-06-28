import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
// @ts-ignore
import { createSdoaModule } from '../../../server/src/engine/sdoaFileApi';

export async function extractSchema(hits: any[]) {
  for (const hit of hits) {
    const { filePath, interfaceSnippet, name } = hit;

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const targetDir = path.join(workspaceRoot, 'ui', 'data', 'schemas');
    const targetFile = path.join(targetDir, `${name}.ts`);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const codeBody = [
      `${interfaceSnippet}`
    ].join("\n");

    await createSdoaModule({
      type: "schema",
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

      if (interfaceSnippet === original) {
        addedSnippet = `// SDOA EXTRACTED: ${name}\nimport { ${name} } from 'ui/data/schemas/${name}';\n`;
        updated = addedSnippet + original;
      } else {
        addedSnippet = `import { ${name} } from 'ui/data/schemas/${name}';`;
        updated = original.replace(interfaceSnippet, addedSnippet);
      }

      vscode.commands.executeCommand("sdoa.showExtractionDiff", {
        file: filePath,
        removed: [interfaceSnippet],
        added: [addedSnippet],
        unifiedDiff: `- ${interfaceSnippet}\n+ ${addedSnippet}`,
        modulePath: targetFile,
        moduleSource: codeBody,
        originalSource: original,
        header: `Extracted ${name} (schema)`
      });
    }
  }
}
