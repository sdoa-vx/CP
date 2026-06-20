import crypto from 'crypto';
export const FEDERATION_SECRET = process.env.FEDERATION_SECRET || 'default-insecure-secret';
export function generateSignature(payload: any, secret: string = FEDERATION_SECRET): string {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}
export function verifySignature(payload: any, signature: string, secret: string = FEDERATION_SECRET): boolean {
  const expected = generateSignature(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
