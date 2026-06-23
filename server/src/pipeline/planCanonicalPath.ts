import path from "node:path";

export const MANIFEST = {
  id: "planCanonicalPath.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "planCanonicalPath"
  ],
  dependencies: [
    "node:path"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};



const CANONICAL_ROOTS: Record<string, string> = {
  primitive: "ui/primitives",
  workflow: "substrate/workflows",
  validator: "substrate/validators",
  schema: "ui/data/schemas",
  engine: "evolution/engines",
  registry: "authorities/registry"
};

export function planCanonicalPath(proposal: any) {
  const type = proposal?.type;
  const name = (proposal?.name || "Extracted").replace(/\s+/g, "");

  const dir = CANONICAL_ROOTS[type];
  if (!dir) {
    const err = new Error(`Invalid proposal type: ${type}. Violates canonical roots.`);
    (err as any).statusCode = 400;
    throw err;
  }

  // Determine file extension
  let ext = "ts";
  if (proposal.source?.language === "json" || type === "schema") ext = "json";
  else if (proposal.source?.language === "tsx" || type === "primitive") ext = "tsx";
  else if (proposal.source?.language === "js") ext = "js";

  return path.join(process.cwd(), dir, `${name}.${type}.${ext}`);
}
