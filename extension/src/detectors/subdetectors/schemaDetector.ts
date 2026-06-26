import * as ts from 'typescript';

export const MANIFEST = {
  id: "schemaDetector.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "SchemaDetector"
  ],
  dependencies: [
    "typescript"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

export class SchemaDetector {
  public run(cache: Map<string, any>) {
    const interfaceSignatures = new Map<string, string[]>();

    for (const [filePath, data] of cache.entries()) {
      if (data.type !== 'ast') continue;

      const sourceFile = data.sourceFile as ts.SourceFile;
      
      const visit = (node: ts.Node) => {
        if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
          // simple structural hash
          const signature = node.getText(sourceFile).replace(/\s+/g, '').replace(/[a-zA-Z0-9_]+:/g, 'field:');
          
          if (signature.length > 20) {
            const existing = interfaceSignatures.get(signature) || [];
            if (!existing.includes(filePath)) existing.push(filePath);
            interfaceSignatures.set(signature, existing);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }

    const proposals = [];
    let counter = 1;
    for (const [hash, files] of interfaceSignatures.entries()) {
      if (files.length >= 2) {
        const name = `Schema${counter}`;
        const hits = files.map(filePath => ({
          filePath,
          interfaceSnippet: hash,
          name
        }));
        
        import('../../extraction/index').then(({ runExtraction }) => {
          runExtraction('schema', hits);
        }).catch(err => console.error("Extraction error:", err));

        proposals.push({
          id: `schema-${counter}.json`,
          type: "schema",
          layer: 2,
          suggestedFile: `ui/data/schemas/schema-${counter}.schema.json`,
          locations: files
        });
        counter++;
      }
    }
    return proposals;
  }
}
