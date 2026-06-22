import { IncomingMessage, ServerResponse } from "node:http";
import { parseJsonBody } from "../utils/parseJsonBody";
import { runProbationOfficer } from "../validators/probationOfficer";
import { checkSemanticSimilarity } from "../fisp/semanticSimilarity";
import { storeProposal } from "../fisp/storeProposal";
import { db } from "../fisp/database";
import { getPRMetadataLocal } from "../fisp/storeProposal";

export async function handleLatestProposal(req: IncomingMessage, res: ServerResponse) {
  const proposalRow = db.prepare('SELECT * FROM proposals ORDER BY timestamp DESC LIMIT 1').get() as any;
  if (!proposalRow) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: "No proposals found." }));
  }
  const prMeta = getPRMetadataLocal(proposalRow.id);
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
      return res.end(JSON.stringify({ error: probationResult.reason }));
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
