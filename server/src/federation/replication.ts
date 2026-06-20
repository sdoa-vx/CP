import { generateSignature } from './handshake';
import { logger } from '../utils/logger';
export async function replicateProposalToPeers(envelope: any) {
  const peers = (process.env.FEDERATION_PEERS || '').split(',').filter(Boolean);
  for (const peer of peers) {
    try {
      const payload = JSON.stringify(envelope);
      const signature = generateSignature(payload);
      await fetch(${peer}/federation/v1/sync, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-mcp-signature': signature }, body: payload });
      logger.info("Replicated proposal  to ");
    } catch(e) { logger.error("Failed to replicate to ", e); }
  }
}
