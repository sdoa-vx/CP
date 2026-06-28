
export const MANIFEST = {
  id: "tokenDetector.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "TokenDetector"
  ],
  dependencies: [],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};


export class TokenDetector {
  public run(cache: Map<string, any>) {
    const hexRegex = /#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})\b/g;
    const pxRegex = /\b(\d+)px\b/g;
    
    const tokenSignatures = new Map<string, string[]>();

    for (const [filePath, data] of cache.entries()) {
      if (data.type !== 'css') continue;

      const content = data.content;
      
      const findTokens = (regex: RegExp, type: string) => {
        let match;
        while ((match = regex.exec(content)) !== null) {
          const val = match[0].toLowerCase();
          const existing = tokenSignatures.get(val) || [];
          if (!existing.includes(filePath)) existing.push(filePath);
          tokenSignatures.set(val, existing);
        }
      };

      findTokens(hexRegex, 'color');
      findTokens(pxRegex, 'size');
    }

    const proposals = [];
    for (const [val, files] of tokenSignatures.entries()) {
      if (files.length >= 3) {
        const name = val.startsWith('#') ? `--color-${val.replace('#', '')}` : `--size-${val}`;
        
        const hits = files.map(filePath => ({
          filePath,
          tokenName: name,
          value: val,
          originalSnippet: val
        }));
        
        import('../../extraction/index').then(({ runExtraction }) => {
          runExtraction('token', hits);
        }).catch(err => console.error("Extraction error:", err));

        proposals.push({
          name,
          value: val,
          usedIn: files
        });
      }
    }
    return proposals;
  }
}
