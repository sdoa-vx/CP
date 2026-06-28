// ------------------------------------------------------------------
// File:    cognitiveLoadMeter.ts
// Version: 1.0.0
// Updated: 2026-06-23T15:41:00.000Z
// Changes: Initial creation of SDOA-compliant cognitive load meter
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "engine.cognizance.cognitiveLoadMeter",
  type: "engine",
  layer: "substrate",
  runtime: "node",
  version: "1.0.0",
  action_surface: [],
  commands: [],
  events: [],
  accepts: [],
  slots: [],
  dependencies: [],
  sovereign_lineage: "engine.cognizance.cognitiveLoadMeter",
  variant_of: null,
  docs: {
    description: "Computes cognitive load score for a source file.",
    last_modified: "2026-06-23T15:41:00.000Z"
  }
} as const;

export function measureCognitiveLoad(source: string): number {
  const lines = source.split("\n").length;
  const tokens = source.split(/\s+/).filter(Boolean).length;

  const nestingDepth = estimateNestingDepth(source);
  const branchCount = countBranches(source);

  let score =
    lines * 0.25 +
    tokens * 0.02 +
    nestingDepth * 4 +
    branchCount * 2;

  if (score > 100) score = 100;
  if (score < 0) score = 0;

  return Math.round(score);
}

function estimateNestingDepth(source: string): number {
  let depth = 0;
  let maxDepth = 0;

  for (const ch of source) {
    if (ch === "{") {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    } else if (ch === "}") {
      depth = Math.max(0, depth - 1);
    }
  }

  return maxDepth;
}

function countBranches(source: string): number {
  const patterns = [
    /\bif\b/g,
    /\belse if\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bswitch\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /\?\s*[^:]+:/g
  ];

  let count = 0;
  for (const re of patterns) {
    const matches = source.match(re);
    if (matches) count += matches.length;
  }
  return count;
}
