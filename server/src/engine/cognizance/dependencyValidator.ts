export function validateDependencies(manifest: any, issues: string[], suggestions: string[]) {
  if (!manifest) return;
  if (manifest.dependencies && !Array.isArray(manifest.dependencies)) {
    issues.push(`Dependencies must be an array`);
    suggestions.push(`Convert dependencies to a string array`);
  }
}
