import { IncomingMessage, ServerResponse } from "http";
import { parseJsonBody } from "../utils/parseJsonBody";
import { loadProposal } from "../fisp/loadProposal";
import { runCreationPipeline } from "../pipeline/CreationPipeline";
import { updateProposalStatus } from "../fisp/loadProposal"; // Reused from loadProposal mock
import { broadcastDashboardUpdate } from "../ws";

export async function handleDecision(req: IncomingMessage, res: ServerResponse) {
  const body = await parseJsonBody(req);
  const { decision, notes, applyToCanonical } = body;

  const id = req.url!.split("/").pop()!;
  const proposal = await loadProposal(id);

  if (!proposal) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: "Proposal not found" }));
  }

  if (decision === "reject" || !applyToCanonical) {
    await updateProposalStatus(id, "rejected", notes);
    broadcastDashboardUpdate('proposal_update', { id, status: 'rejected' });
    res.statusCode = 200;
    return res.end(JSON.stringify({ status: "rejected", notes }));
  }

  const result = await runCreationPipeline(proposal as any);
  
  if (result.ok) {
    await updateProposalStatus(id, "accepted", notes);
    broadcastDashboardUpdate('proposal_update', { id, status: 'accepted' });
  }

  res.statusCode = result.ok ? 200 : 400;
  res.end(JSON.stringify(result));
}
