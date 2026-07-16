// ───────────────────────────
// File:    workflows/ValidateGithubWebhook.workflow.ts
// Version: 1.0.00
// Updated: 2026-07-13T00:00:00Z
// Changes: Initial HMAC-SHA256 signature verification for GitHub webhooks
// ───────────────────────────
//
// Uses only Web Crypto (crypto.subtle) — runs identically in Cloudflare
// Workers, Node 18+, Deno, and Bun. No Node-specific 'crypto' import, so
// this is testable outside any Workers runtime per SDOA governance 4.2.

export interface ValidateGithubWebhookInput {
  /** Raw request body, exactly as received — must not be re-serialized JSON. */
  rawBody: string;
  /** Value of the 'x-hub-signature-256' header, e.g. "sha256=abcdef..." */
  signatureHeader: string | null;
  /** The webhook secret configured on the GitHub App. */
  webhookSecret: string;
}

export class ValidateGithubWebhookWorkflow {
  static MANIFEST = {
    id: 'ValidateGithubWebhook.workflow',
    type: 'workflow',
    version: '1.0.0',
    runtime: 'Universal',
    capabilities: ['github:webhook:verify'],
    dependencies: [],
    docs: { description: 'Verifies the HMAC-SHA256 signature GitHub attaches to webhook deliveries.' },
    last_modified: '2026-07-13T00:00:00Z',
    layer: 3,
    requires: [],
    dataFiles: [],
    lifecycle: ['init', 'run', 'dispose'],
    actions: { commands: {}, events: {}, accepts: {}, slots: {} },
    operationalRole: 'probation-officer',
    optimization: { priority: 'high', assertionSuite: 'strict' }
  };

  private registry: unknown;

  constructor(registry?: unknown) {
    this.registry = registry;
  }

  init(registry: unknown) {
    this.registry = registry;
    return { ok: true, data: { status: 'ValidateGithubWebhookWorkflow initialized' } };
  }

  async run(payload: ValidateGithubWebhookInput) {
    try {
      const { rawBody, signatureHeader, webhookSecret } = payload;

      if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
        return { ok: false, error: 'Missing or malformed x-hub-signature-256 header' };
      }
      if (!webhookSecret) {
        return { ok: false, error: 'No webhook secret configured' };
      }

      const expectedHex = signatureHeader.slice('sha256='.length);
      const computedHex = await this._hmacSha256Hex(webhookSecret, rawBody);

      const valid = this._timingSafeEqualHex(expectedHex, computedHex);
      if (!valid) {
        return { ok: false, error: 'Signature mismatch' };
      }

      return { ok: true, data: { verified: true } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  dispose() {
    this.registry = null;
    return { ok: true };
  }

  private async _hmacSha256Hex(secret: string, message: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /** Constant-time comparison of two equal-length hex strings. */
  private _timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
      mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
  }
}

export default ValidateGithubWebhookWorkflow;
