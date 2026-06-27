// ------------------------------------------------------------------
// File:    fileWatcher.ts
// Version: 1.1.0
// Updated: 2026-06-25T00:00:00.000Z
// Changes: Added a one-time recursive scan on point-at (fs.watch only fires on
//          *changes*, so a static tree was never read), broadened the file
//          filter beyond .ts/.tsx to .js/.jsx/.mjs/.cjs/.py/.rs, and added a
//          dir ignore-list (node_modules, _variances, etc.) so large trees no
//          longer choke the walk. Only files that declare a real SDOA MANIFEST
//          (analyzeFile().isModule) are reported.
// SDOA compliance is required
// ------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { analyzeFile } from './cognizanceEngine';
import { sendToExtension } from '../../ipc/vscodeBridge';

const SCANNABLE = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs',
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage',
  '_variances', '.venv', 'venv', '__pycache__', '.cache', 'vendor', '.turbo',
]);

let watcher: fs.FSWatcher | null = null;

function isScannable(file: string): boolean {
  return SCANNABLE.has(path.extname(file).toLowerCase());
}

// Analyze a single file; report it only if it declares a real SDOA module.
function analyzeOne(fullPath: string): boolean {
  try {
    const source = fs.readFileSync(fullPath, 'utf8');
    const result = analyzeFile(fullPath, source) as any;
    if (result.isModule) {
      sendToExtension('cognizance:update', result);
      return true;
    }
  } catch (e) {
    console.warn(`[SDOA] Failed to analyze file ${fullPath}:`, e);
  }
  return false;
}

// One-time recursive walk of an existing tree. THIS is the fix for "scan finds
// nothing": fs.watch never reads files that aren't being edited, so a static
// project directory previously produced zero analysis.
export function scanWorkspace(root: string): { scanned: number; modules: number } {
  let scanned = 0;
  let modules = 0;

  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir — skip
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (entry.isFile() && isScannable(entry.name)) {
        scanned++;
        if (analyzeOne(full)) modules++;
      }
    }
  };

  walk(root);
  sendToExtension('cognizance:scan-complete', { root, scanned, modules });
  console.log(
    `[SDOA] Cognizance scan of ${root}: ${scanned} files scanned, ${modules} SDOA modules recognized`,
  );
  return { scanned, modules };
}

export function watchWorkspace(root: string) {
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  console.log(`[SDOA] Cognizance Engine scanning + watching workspace: ${root}`);

  // 1) Full initial scan of files already on disk.
  scanWorkspace(root);

  // 2) Then watch for live edits across all supported languages.
  try {
    watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const rel = filename.toString();
      if (!isScannable(rel)) return;
      if (rel.split(/[\\/]/).some((seg) => IGNORED_DIRS.has(seg))) return;

      const fullPath = path.join(root, rel);
      if (!fs.existsSync(fullPath)) return;
      analyzeOne(fullPath);
    });
  } catch (e) {
    console.warn(
      `[SDOA] recursive watch unavailable for ${root}; initial scan still completed.`,
      e,
    );
  }
}
