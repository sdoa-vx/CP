import { recordFederationSync } from '../utils/telemetry';
import { IncomingMessage, ServerResponse } from 'http';
import { parseJsonBody } from '../utils/parseJsonBody';
import { verifySignature } from '../federation/handshake';
import { storeProposal } from '../fisp/storeProposal';
import { logger } from '../utils/logger';

export const MANIFEST = {
  id: "federation.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "handleFederation"
  ],
  dependencies: [
    "../utils/telemetry",
    "http",
    "../utils/parseJsonBody",
    "../federation/handshake",
    "../fisp/storeProposal",
    "../utils/logger"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};


export async function handleFederation(req: IncomingMessage, res: ServerResponse) {
  if (req.url === '/federation/v1/health' && req.method === 'GET') { return res.end(JSON.stringify({ status: 'federation_ok', uptime: process.uptime() })); }
  if (req.url === '/federation/v1/sync' && req.method === 'POST') {
    const signature = req.headers['x-mcp-signature'] as string;
    if(!signature) { res.statusCode = 401; return res.end('Missing signature'); }
    const body = await parseJsonBody(req);
    if(!verifySignature(body, signature)) { res.statusCode = 403; return res.end('Invalid signature'); }
    logger.info("Received synchronized proposal: ");
    await storeProposal(body);
    res.statusCode = 202;
    return res.end(JSON.stringify({ status: 'synced' }));
  }
  res.statusCode = 404; res.end('Not Found');
}

