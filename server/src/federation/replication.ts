import { generateSignature } from './handshake';
import { logger } from '../utils/logger';
import { db } from '../fisp/database';
import { scheduleFlush } from '../workers/offlineSync';

export const MANIFEST = {
  id: "replication.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "replicateProposalToPeers"
  ],
  dependencies: [
    "./handshake",
    "../utils/logger",
    "../fisp/database"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};



export async function replicateProposalToPeers(envelope: any) {
  const peers = (process.env.FEDERATION_PEERS || '').split(',').filter(Boolean);
  for (const peer of peers) {
    try {
      const payload = JSON.stringify(envelope);
      const signature = generateSignature(payload);
      await fetch(`${peer}/federation/v1/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-mcp-signature': signature }, body: payload });
      logger.info(`Replicated proposal ${envelope.proposalId} to ${peer}`);
    } catch(e) { 
      try {
        db.prepare('INSERT INTO offline_queue (type, target, payload, created_at) VALUES (?, ?, ?, ?)').run('FEDERATION', peer, JSON.stringify(envelope), new Date().toISOString());
        scheduleFlush();
      } catch (err) { /* silent */ }
    }
  }
}
