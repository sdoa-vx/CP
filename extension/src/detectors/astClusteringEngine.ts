import * as ts from 'typescript';
import * as vscode from 'vscode';
import * as fs from 'fs';

export class ASTClusteringEngine {
  private cache: Map<string, any> = new Map();

  constructor() {
    this.lazyLoadWorkspace();
  }

  private async lazyLoadWorkspace() {
    setTimeout(async () => {
      try {
        const files = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx,css}', '**/node_modules/**');
        for (const file of files) {
          this.cacheFile(file.fsPath);
        }
        console.log(`[SDOA] Cached ${this.cache.size} files for AST clustering.`);
      } catch (e) {
        console.error("AST cache error", e);
      }
    }, 5000); // Lazy load 5s after startup
  }

  public cacheFile(filePath: string) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (filePath.endsWith('.css')) {
        this.cache.set(filePath, { type: 'css', content });
        return;
      }

      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
      );
      this.cache.set(filePath, { type: 'ast', sourceFile });
    } catch (e) {
      // silent
    }
  }

  public getCache() {
    return this.cache;
  }
}

export const globalAstEngine = new ASTClusteringEngine();
