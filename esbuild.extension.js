
const MANIFEST = {
  id: "esbuild.extension.js",
  type: "module",
  layer: 4,
  runtime: "JavaScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "build",
    "bundle"
  ],
  dependencies: [
    "esbuild"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['extension/src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension/extension.js',
  external: ['vscode'],      // provided by the IDE host — never bundle
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: false,
  minify: false,
}).catch(() => process.exit(1));
