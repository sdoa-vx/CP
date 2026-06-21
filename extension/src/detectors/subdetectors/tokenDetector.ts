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
        proposals.push({
          name: val.startsWith('#') ? `--color-${val.replace('#', '')}` : `--size-${val}`,
          value: val,
          usedIn: files
        });
      }
    }
    return proposals;
  }
}
