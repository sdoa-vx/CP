export const MANIFEST = {
  id: "layerEnforcer.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "speed" },
  capabilities: [
    "enforceLayerBoundaries"
  ],
  dependencies: [],
  docs: "Enforces SDOA layer boundaries: Primitives (2) cannot import Workflows (3) or Authorities (4)"
};

export function enforceLayerBoundaries(content: string, layer: number): { ok: boolean, reason?: string } {
  // Extract all import paths
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];

    if (layer === 2) {
      if (importPath.includes("workflows") || importPath.includes("substrate") || importPath.includes("authorities")) {
        return { ok: false, reason: `Layer Violation: Primitive (Layer 2) cannot import ${importPath}` };
      }
    } else if (layer === 3) {
      if (importPath.includes("authorities")) {
        return { ok: false, reason: `Layer Violation: Workflow (Layer 3) cannot import Authority (${importPath})` };
      }
    }
  }

  return { ok: true };
}
