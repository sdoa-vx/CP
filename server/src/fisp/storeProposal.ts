import { db } from './database';
import { broadcastDashboardUpdate } from '../ws';

export async function storeProposal(envelope: any) {
  db.prepare('INSERT INTO proposals (id, status, data, timestamp) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
    .run(envelope.proposalId, 'queued', JSON.stringify(envelope), new Date().toISOString());
  
  broadcastDashboardUpdate('proposal_update', { id: envelope.proposalId });
  return { id: envelope.proposalId };
}
