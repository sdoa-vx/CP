import { db } from './database';
import { broadcastDashboardUpdate } from '../ws';
import { recordPipelineStep } from '../utils/telemetry';

export async function storeProposal(envelope: any) {
  db.prepare('INSERT INTO proposals (id, status, data, timestamp) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
    .run(envelope.proposalId, 'queued', JSON.stringify(envelope), new Date().toISOString());
  
  broadcastDashboardUpdate('proposal_update', { id: envelope.proposalId });
  return { id: envelope.proposalId };
}

export function savePRMetadataLocal(proposalId: string, prUrl: string | null) {
  const status = prUrl ? 'open' : null;
  db.prepare('INSERT INTO pr_metadata (proposalId, prUrl, status) VALUES (?, ?, ?) ON CONFLICT(proposalId) DO UPDATE SET prUrl = excluded.prUrl, status = excluded.status')
    .run(proposalId, prUrl, status);
}

export function getPRMetadataLocal(proposalId: string) {
  return db.prepare('SELECT * FROM pr_metadata WHERE proposalId = ?').get(proposalId);
}

export function updatePRStatusByUrl(prUrl: string, status: string) {
  db.prepare('UPDATE pr_metadata SET status = ? WHERE prUrl = ?').run(status, prUrl);
  
  if (status === 'merged') {
    const prMeta = db.prepare('SELECT proposalId FROM pr_metadata WHERE prUrl = ?').get(prUrl) as any;
    if (prMeta?.proposalId) {
      db.prepare('UPDATE proposals SET status = ? WHERE id = ?').run('accepted', prMeta.proposalId);
      onProposalMerged(prMeta.proposalId);
    }
  }
}

export function updatePRCIStatusByUrl(prUrl: string, ciStatus: string, ciLogUrl: string) {
  db.prepare('UPDATE pr_metadata SET ci_status = ?, ci_log_url = ? WHERE prUrl = ?').run(ciStatus, ciLogUrl, prUrl);
}

function onProposalMerged(proposalId: string) {
  const proposal = db.prepare('SELECT * FROM proposals WHERE id = ?').get(proposalId) as any;
  if (!proposal) return;
  
  let data;
  try {
    data = JSON.parse(proposal.data);
  } catch (e) {
    console.error("Failed to parse proposal data:", e);
    return;
  }
  
  // Archiving/Release Notes/Downstream actions handled by external workers via telemetry
  data.archived = true;
  db.prepare('UPDATE proposals SET data = ? WHERE id = ?').run(JSON.stringify(data), proposalId);
  
  // Emit telemetry event so external workers can pick this up
  recordPipelineStep(proposalId, "Proposal Lifecycle", "passed", { 
    event: "proposal_merged",
    message: "PR merged, proposal accepted and ready for downstream pipelines."
  }).catch((err: any) => console.error("Telemetry error:", err));

  broadcastDashboardUpdate('proposal_update', { id: proposalId, action: "merged" });
}

