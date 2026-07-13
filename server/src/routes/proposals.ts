import { IncomingMessage, ServerResponse } from "node:http";
import { parseJsonBody } from "../utils/parseJsonBody";
import { runProbationOfficer } from "../validators/probationOfficer";
import { checkSemanticSimilarity } from "../fisp/semanticSimilarity";
import { storeProposal } from "../fisp/storeProposal";
import { db } from "../fisp/database";
import { getPRMetadataLocal } from "../fisp/storeProposal";

export const MANIFEST = {
  id: "proposals.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "handleLatestProposal",
    "handleProposals"
  ],
  dependencies: [
    "node:http",
    "../utils/parseJsonBody",
    "../validators/probationOfficer",
    "../fisp/semanticSimilarity",
    "../fisp/storeProposal",
    "../fisp/database"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};



export async function handleLatestProposal(req: IncomingMessage, res: ServerResponse) {
  const proposalRow = db.prepare('SELECT * FROM proposals ORDER BY timestamp DESC LIMIT 1').get() as any;
  if (!proposalRow) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: "No proposals found." }));
  }
  const prMeta = getPRMetadataLocal(proposalRow.id) as any;
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({
    ...JSON.parse(proposalRow.data),
    status: proposalRow.status,
    prUrl: prMeta?.prUrl || null
  }));
}

export async function handleProposals(req: IncomingMessage, res: ServerResponse) {
  const body = await parseJsonBody(req);

  // Pre-gate: Probation Officer
  for (const innovation of body.innovations || []) {
    const probationResult = runProbationOfficer(innovation);
    if (!probationResult.ok) {
      res.statusCode = 400;
      const reason = (probationResult as any).reason || "Failed governance probation sandbox";
      return res.end(JSON.stringify({ ok: false, error: reason }));
    }
  }

  // Semantic similarity
  for (const innovation of body.innovations || []) {
    const similarityResult = await checkSemanticSimilarity(innovation);
    if (similarityResult.merged) {
      res.statusCode = 409;
      return res.end(JSON.stringify({ status: "merged", id: similarityResult.id }));
    }
  }

  const saved = await storeProposal(body);
  res.statusCode = 202;
  res.end(JSON.stringify({ status: "accepted", id: saved.id }));
}
