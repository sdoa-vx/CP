import { IncomingMessage, ServerResponse } from "node:http";
import { parseJsonBody } from "../utils/parseJsonBody";
import { runProbationOfficer } from "../validators/probationOfficer";
import { checkSemanticSimilarity } from "../fisp/semanticSimilarity";
import { storeProposal } from "../fisp/storeProposal";

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
