import * as ts from 'typescript';

export const MANIFEST = {
  id: "workflowDetector.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "WorkflowDetector"
  ],
  dependencies: [
    "typescript"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

export class WorkflowDetector {
  public run(cache: Map<string, any>) {
    const fetchSignatures = new Map<string, string[]>();

    for (const [filePath, data] of cache.entries()) {
      if (data.type !== 'ast') continue;

      const sourceFile = data.sourceFile as ts.SourceFile;
      
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
          const exp = node.expression;
          if (ts.isIdentifier(exp) && exp.text === 'fetch') {
            const args = node.arguments;
            if (args.length > 0 && ts.isStringLiteral(args[0])) {
              const url = args[0].text;
              const existing = fetchSignatures.get(url) || [];
              if (!existing.includes(filePath)) existing.push(filePath);
              fetchSignatures.set(url, existing);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }

    const proposals = [];
    for (const [url, files] of fetchSignatures.entries()) {
      if (files.length >= 3) {
        // extract PascalCase from URL, fallback to 'Workflow'
        const base = url.split('/').pop()?.replace(/[^a-zA-Z]/g, '') || 'Generic';
        const name = base.charAt(0).toUpperCase() + base.slice(1) + 'Workflow';
        
        const hits = files.map(filePath => ({
          filePath,
          fetchSnippet: `fetch("${url}")`,
          name
        }));
        
        import('../../extraction/index').then(({ runExtraction }) => {
          runExtraction('workflow', hits);
        }).catch(err => console.error("Extraction error:", err));

        proposals.push({
          id: `${name}.workflow.js`,
          type: "workflow",
          layer: 3,
          suggestedFile: `server/workflows/${name}.workflow.js`,
          endpoint: url,
          locations: files
        });
      }
    }
    return proposals;
  }
}
