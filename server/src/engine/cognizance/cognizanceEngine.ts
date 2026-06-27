import { validateManifest } from './manifestValidator';
import { validateVersion } from './versionValidator';
import { validateDependencies } from './dependencyValidator';
import { validatePlacement } from './placementValidator';
import { detectDrift } from './driftDetector';
import { measureCognitiveLoad } from './cognitiveLoadMeter';

export function analyzeFile(filePath: string, source: string) {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // 1. MANIFEST
  const manifest = validateManifest(source, issues, suggestions);

  // 2. Version
  validateVersion(manifest, issues, suggestions);

  // 3. Dependencies
  validateDependencies(manifest, issues, suggestions);

  // 4. Placement
  validatePlacement(filePath, manifest, issues, suggestions);

  // 5. Drift
  detectDrift(filePath, source, manifest, issues, suggestions);

  // 6. Cognitive Load
  const cognitiveLoad = measureCognitiveLoad(source);

  // Score
  const score = Math.max(
    0,
    100 -
      issues.length * 5 -
      Math.max(0, cognitiveLoad - 50) * 0.5
  );

  // Whether this file actually declares an SDOA module (a real MANIFEST was
  // found, not the "UNKNOWN" stub the validator returns for non-modules). The
  // wild-scan uses this to record only genuine modules.
  const isModule = manifest.id !== "UNKNOWN";

  return {
    file: filePath,
    score,
    issues,
    suggestions,
    cognitiveLoad,
    manifest,
    isModule
  };
}
