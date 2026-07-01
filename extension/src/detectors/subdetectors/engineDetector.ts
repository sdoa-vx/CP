import * as ts from 'typescript';

export const MANIFEST = {
  id: "engineDetector.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "EngineDetector"
  ],
  dependencies: [
    "typescript"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};



export class EngineDetector {
  public run(cache: Map<string, any>) {
    const execSignatures = new Map<string, string[]>();

    for (const [filePath, data] of cache.entries()) {
      if (data.type !== 'ast') continue;

      const sourceFile = data.sourceFile as ts.SourceFile;
      
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
          const exp = node.expression;
          // check for child_process.exec or spawn
          if (ts.isPropertyAccessExpression(exp) && (exp.name.text === 'exec' || exp.name.text === 'spawn' || exp.name.text === 'fork')) {
            const args = node.arguments;
            if (args.length > 0 && ts.isStringLiteral(args[0])) {
              const bin = args[0].text;
              const existing = execSignatures.get(bin) || [];
              if (!existing.includes(filePath)) existing.push(filePath);
              execSignatures.set(bin, existing);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }

    const proposals = [];
    for (const [bin, files] of execSignatures.entries()) {
      if (files.length >= 2) {
        const name = bin.split(' ')[0].replace(/[^a-zA-Z]/g, '') || 'Engine';
        
        const hits = files.map(filePath => ({
          filePath,
          spawnSnippet: bin,
          name
        }));
        


        proposals.push({
          id: `${name}.engine.js`,
          type: "engine",
          layer: 4,
          suggestedFile: `substrate/engines/${name}/${name}.engine.js`,
          locations: files
        });
      }
    }
    return proposals;
  }
}
