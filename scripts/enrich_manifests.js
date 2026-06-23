const fs = require('fs');
const path = require('path');

function walk(d) {
  let res = [];
  const files = fs.readdirSync(d);
  for(const f of files) {
    if (['node_modules', '.git', 'dist'].includes(f)) continue;
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) {
      res = res.concat(walk(p));
    } else if (/\.(ts|js)$/.test(f)) {
      res.push(p);
    }
  }
  return res;
}

const files = walk(process.cwd());
let enrichedCount = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Find generic manifests
  if (content.includes('optimization: { priority: "stability" }')) {
    const filename = path.basename(file);
    const ext = path.extname(filename);
    const isJS = ext === '.js';
    
    // Extract dependencies from imports
    const deps = new Set();
    const importRegex = /import .* from ['"]([^'"]+)['"]/g;
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) deps.add(match[1]);
    while ((match = requireRegex.exec(content)) !== null) deps.add(match[1]);
    
    // Extract capabilities from exports
    const caps = new Set();
    const exportRegex = /export (?:async )?(?:function|const|class) ([a-zA-Z0-9_]+)/g;
    while ((match = exportRegex.exec(content)) !== null) {
      if (match[1] !== 'MANIFEST') caps.add(match[1]);
    }

    // Convert sets to formatted arrays
    const depStr = Array.from(deps).length > 0 ? `[\n    "${Array.from(deps).join('",\n    "')}"\n  ]` : `[]`;
    const capStr = Array.from(caps).length > 0 ? `[\n    "${Array.from(caps).join('",\n    "')}"\n  ]` : `[]`;
    
    // Build new manifest
    const isExported = content.includes('export const MANIFEST =');
    const declaration = isExported ? 'export const MANIFEST =' : 'const MANIFEST =';
    
    const newManifest = `${declaration} {
  id: "${filename}",
  type: "module",
  layer: 4,
  runtime: "${isJS ? 'JavaScript' : 'TypeScript'}",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: ${capStr},
  dependencies: ${depStr},
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};`;

    // Replace the old manifest block
    // It's a bit tricky to replace the whole object with regex because of varying whitespace.
    // The old manifest generally starts with `export const MANIFEST = {` or `const MANIFEST = {`
    // and ends with `};`
    
    const replaceRegex = /(?:export const MANIFEST =|const MANIFEST =) \{[\s\S]*?optimization: \{ priority: "stability" \}[\s\S]*?\};/;
    
    if (replaceRegex.test(content)) {
      content = content.replace(replaceRegex, newManifest);
      fs.writeFileSync(file, content, 'utf8');
      enrichedCount++;
      console.log(`Enriched MANIFEST in: ${file}`);
    } else {
      console.log(`Failed to match MANIFEST block in: ${file}`);
    }
  }
}

console.log(`Successfully enriched MANIFESTs in ${enrichedCount} files.`);
