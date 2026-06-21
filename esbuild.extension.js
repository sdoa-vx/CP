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
