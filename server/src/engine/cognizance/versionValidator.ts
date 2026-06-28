export function validateVersion(manifest: any, issues: string[], suggestions: string[]) {
  if (!manifest) return;
  if (manifest.version && !manifest.version.match(/^\d+\.\d+\.\d+$/)) {
    issues.push(`Invalid version format: ${manifest.version}`);
    suggestions.push(`Update version to follow semver (e.g., 1.0.0)`);
  }
}
