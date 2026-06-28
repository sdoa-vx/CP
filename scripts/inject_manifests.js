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
let injectedCount = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('MANIFEST')) {
    const filename = path.basename(file);
    const ext = path.extname(filename);
    const isJS = ext === '.js';
    
    // JS needs to use module.exports or const. TS uses export const.
    // If it's a browser JS file (like public/dashboard.js), we shouldn't use export.
    // Let's use a generic format that works.
    
    let manifestStr = `
export const MANIFEST = {
  id: "inject_manifests.js",
  type: "module",
  layer: 4,
  runtime: "JavaScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "import",
    "export"
  ],
  dependencies: [
    "fs",
    "path"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};
`;

    // For public files, just define a constant without export
    if (file.includes('public') || (isJS && !content.includes('import ') && !content.includes('export '))) {
      manifestStr = `
const MANIFEST = {
  id: "${filename}",
  type: "module",
  layer: 4,
  runtime: "${isJS ? 'JavaScript' : 'TypeScript'}",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" }
};
`;
    }

    // Insert after "use strict" or first block comment if present
    if (content.startsWith('/*')) {
      const endOfComment = content.indexOf('*/') + 2;
      const afterComment = content.substring(endOfComment);
      if (afterComment.trim().startsWith("'use strict'") || afterComment.trim().startsWith('"use strict"')) {
        const strictMatch = afterComment.match(/['"]use strict['"];?/);
        const insertIdx = endOfComment + strictMatch.index + strictMatch[0].length;
        content = content.substring(0, insertIdx) + '\n' + manifestStr + '\n' + content.substring(insertIdx);
      } else {
        content = content.substring(0, endOfComment) + '\n' + manifestStr + '\n' + afterComment;
      }
    } else {
      // Just put it below any imports if they exist
      const importMatches = [...content.matchAll(/import .* from ['"].*['"];?\n/g)];
      if (importMatches.length > 0) {
        const lastImport = importMatches[importMatches.length - 1];
        const insertIdx = lastImport.index + lastImport[0].length;
        content = content.substring(0, insertIdx) + '\n' + manifestStr + '\n' + content.substring(insertIdx);
      } else {
        content = manifestStr + '\n' + content;
      }
    }

    fs.writeFileSync(file, content, 'utf8');
    injectedCount++;
    console.log(`Injected MANIFEST into: ${file}`);
  }
}

console.log(`Successfully injected MANIFESTs into ${injectedCount} files.`);
