import { IncomingMessage } from 'http';
export async function parseJsonBody(req: IncomingMessage): Promise<any> { return new Promise((res) => { let body = ''; req.on('data', chunk => body += chunk.toString()); req.on('end', () => res(JSON.parse(body || '{}'))); }); }
