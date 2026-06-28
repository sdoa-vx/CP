import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export async function extractToken(hits: any[]) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  const targetDir = path.join(workspaceRoot, 'ui');
  const targetFile = path.join(targetDir, 'tokens.css');

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let css = fs.existsSync(targetFile)
    ? fs.readFileSync(targetFile, 'utf8')
    : '/* Extracted SDOA Tokens */\n:root {\n';

  // Make sure it doesn't close immediately if we are just appending to root.
  // We'll append before the closing brace if it exists, otherwise just append.
  if (css.includes('}')) {
    css = css.replace(/}\s*$/, '');
  }

  for (const hit of hits) {
    const { tokenName, value, filePath, originalSnippet } = hit;
    css += `  --${tokenName}: ${value};\n`;

    if (fs.existsSync(filePath) && originalSnippet) {
      const original = fs.readFileSync(filePath, 'utf8');
      let updated = "";
      let addedSnippet = "";

      if (originalSnippet === original) {
        addedSnippet = `// SDOA EXTRACTED: var(--${tokenName})\n`;
        updated = addedSnippet + original;
      } else {
        addedSnippet = `var(--${tokenName})`;
        updated = original.replace(originalSnippet, addedSnippet);
      }

      vscode.commands.executeCommand("sdoa.showExtractionDiff", {
        file: filePath,
        removed: [originalSnippet],
        added: [addedSnippet],
        unifiedDiff: `- ${originalSnippet}\n+ ${addedSnippet}`,
        modulePath: targetFile,
        moduleSource: css + `  --${tokenName}: ${value};\n}`,
        originalSource: original,
        header: `Extracted ${tokenName} (token)`
      });
    }
  }

  css += '\n}';
  fs.writeFileSync(targetFile, css);
}
