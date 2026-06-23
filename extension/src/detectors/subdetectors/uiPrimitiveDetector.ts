import * as ts from 'typescript';

export const MANIFEST = {
  id: "uiPrimitiveDetector.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "UIPrimitiveDetector"
  ],
  dependencies: [
    "typescript"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};



export class UIPrimitiveDetector {
  public run(cache: Map<string, any>) {
    const componentHashes = new Map<string, string[]>();

    for (const [filePath, data] of cache.entries()) {
      if (data.type !== 'ast' || !filePath.match(/\.tsx?$/)) continue;

      const sourceFile = data.sourceFile as ts.SourceFile;
      
      let jsxSignature = "";
      const visit = (node: ts.Node) => {
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tagName = ts.isJsxElement(node) 
            ? node.openingElement.tagName.getText(sourceFile)
            : (node as ts.JsxSelfClosingElement).tagName.getText(sourceFile);
          
          if (tagName.toLowerCase() === tagName) { 
            jsxSignature += `<${tagName}>`;
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);

      if (jsxSignature.length > 15) { 
        const existing = componentHashes.get(jsxSignature) || [];
        if (!existing.includes(filePath)) existing.push(filePath);
        componentHashes.set(jsxSignature, existing);
      }
    }

    const proposals = [];
    let counter = 1;
    for (const [hash, files] of componentHashes.entries()) {
      if (files.length >= 3) {
        proposals.push({
          id: `StandardPrimitive${counter}.prim`,
          type: "primitive",
          layer: 2,
          suggestedFile: `ui/primitives/StandardPrimitive${counter}/StandardPrimitive${counter}.prim.js`,
          locations: files
        });
        counter++;
      }
    }
    return proposals;
  }
}
