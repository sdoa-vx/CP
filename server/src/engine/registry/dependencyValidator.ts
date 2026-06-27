// ------------------------------------------------------------------
// File:    dependencyValidator.ts
// Version: 1.0.0
// Updated: 2026-06-23T16:00:00.000Z
// Changes: Initial creation of registry-backed dependency validator
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "engine.registry.dependencyValidator",
  type: "engine",
  layer: "substrate",
  runtime: "node",
  version: "1.0.0",
  action_surface: ["validate.dependencies"],
  commands: ["validateDependenciesWithRegistry"],
  events: [],
  accepts: ["manifest"],
  slots: [],
  dependencies: [],
  sovereign_lineage: "engine.registry.dependencyValidator",
  variant_of: null,
  docs: {
    description: "Validates MANIFEST.dependencies against the SDOA registry and detects missing or invalid references.",
    last_modified: "2026-06-23T16:00:00.000Z"
  }
} as const;

import type { SdoaManifest } from "../sdoaFileApi";

export interface RegistryEntry {
  id: string;
  version: string;
  type: string;
  deprecated?: boolean;
}

export interface Registry {
  getModule(id: string): RegistryEntry | null;
}

let registry: Registry | null = null;

export function attachRegistry(r: Registry) {
  registry = r;
}

export function validateDependenciesWithRegistry(manifest: SdoaManifest): string[] {
  const issues: string[] = [];

  if (!registry) {
    issues.push("Registry not attached: cannot validate dependencies.");
    return issues;
  }

  for (const dep of manifest.dependencies ?? []) {
    const entry = registry.getModule(dep);
    if (!entry) {
      issues.push(`Dependency not found in registry: ${dep}`);
      continue;
    }

    if (entry.deprecated) {
      issues.push(`Dependency is deprecated: ${dep}@${entry.version}`);
    }
  }

  return issues;
}
