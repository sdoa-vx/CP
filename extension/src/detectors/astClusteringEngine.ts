import * as ts from 'typescript';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as http from 'http';

export const MANIFEST = {
  id: "astClusteringEngine.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "ASTClusteringEngine",
    "globalAstEngine"
  ],
  dependencies: [
    "typescript",
    "vscode",
    "fs",
    "http"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

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
        this.syncToBackend();
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
      
      let nodeCount = 0;
      let complexity = 0;
      
      const visit = (node: ts.Node) => {
        nodeCount++;
        if (ts.isIfStatement(node) || ts.isSwitchStatement(node) || ts.isForStatement(node) || ts.isWhileStatement(node) || ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
          complexity++;
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
      
      this.cache.set(filePath, { type: 'ast', sourceFile, nodeCount, complexity });
      this.debouncedSync();
    } catch (e) {
      // silent
    }
  }

  private syncTimeout: NodeJS.Timeout | null = null;
  private debouncedSync() {
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => this.syncToBackend(), 2000);
  }

  private syncToBackend() {
    const payload: Record<string, number> = {};
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    
    for (const [filePath, data] of this.cache.entries()) {
      if (data.type !== 'ast') continue;
      // Normalizing score: highly complex/dense files approach 1.0, simpler files approach 0.0
      // Assume 2000 nodes or 50 complexity points is 'max' heat (1.0)
      const heat = Math.min(1.0, (data.nodeCount / 2000) + (data.complexity / 50));
      const relPath = filePath.replace(workspaceRoot, '').replace(/^[\\\/]/, '').replaceAll('\\', '/');
      payload[relPath] = heat;
    }

    const postData = JSON.stringify(payload);
    const req = http.request({
      hostname: 'localhost',
      port: 8080,
      path: '/dashboard/api/actions/ast-heatmap',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    });
    req.on('error', () => { /* Server might be down, ignore */ });
    req.write(postData);
    req.end();
  }

  public getCache() {
    return this.cache;
  }
}

export const globalAstEngine = new ASTClusteringEngine();
