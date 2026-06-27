import * as fs from 'fs';
import * as path from 'path';

export async function extractPrimitive(hits: any[]) {
  for (const hit of hits) {
    const { filePath, jsxSnippet, name } = hit;

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const targetDir = path.join(workspaceRoot, 'ui', 'primitives');
    const targetFile = path.join(targetDir, `${name}.tsx`);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const codeBody = [
      "import React from 'react';",
      "",
      `export const ${name} = () => (`,
      `  ${jsxSnippet}`,
      `);`
    ].join("\n");

    await createSdoaModule({
      type: "primitive",
      id: name,
      description: "Extracted by SDOA Innovation Detector",
      changeSummary: "Initial extraction",
      codeBody: codeBody,
      dependencies: []
    });

    // Safe replacement
    if (fs.existsSync(filePath)) {
      const original = fs.readFileSync(filePath, 'utf8');
      let updated = "";
      let addedSnippet = "";

      if (jsxSnippet === original) {
        addedSnippet = `// SDOA EXTRACTED: <${name} />\n// TODO: Import { ${name} } from 'ui/primitives/${name}'\n`;
        updated = addedSnippet + original;
      } else {
        addedSnippet = `<${name} />\n// TODO: Add import { ${name} } from 'ui/primitives/${name}'`;
        updated = original.replace(jsxSnippet, addedSnippet);
      }

      vscode.commands.executeCommand("sdoa.showExtractionDiff", {
        file: filePath,
        removed: [jsxSnippet],
        added: [addedSnippet],
        unifiedDiff: `- ${jsxSnippet}\n+ ${addedSnippet}`,
        modulePath: targetFile,
        moduleSource: codeBody,
        originalSource: original,
        header: `Extracted ${name} (primitive)`
      });
    }
  }
}

import * as vscode from 'vscode';
// @ts-ignore
import { createSdoaModule } from '../../../server/src/engine/sdoaFileApi';
