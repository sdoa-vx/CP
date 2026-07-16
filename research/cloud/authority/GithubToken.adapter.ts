// ───────────────────────────
// File:    GithubToken.adapter.ts
// Version: 1.0.00
// Updated: 2026-07-13T00:00:00Z
// Changes: Initial GitHub auth adapter
// ───────────────────────────
//
// IMPORTANT — open decision, not fully resolved:
// The architecture doc calls for a "Scoped installation token generation"
// module (github/tokens.ts), which normally means: sign a short-lived RS256
// JWT with the GitHub App's PRIVATE KEY (.pem), then exchange it at
// POST /app/installations/{id}/access_tokens for a per-installation token.
//
// The credential actually confirmed as rotated/available right now is a
// `github_pat_...` Personal Access Token — a completely different auth
// mechanism (no JWT signing, no per-installation exchange, no expiry
// rotation). A PAT authenticates as a fixed user/token, not as the App.
//
// This adapter implements the PAT path, because that's the credential
// confirmed to exist. If per-installation scoping (the actual GitHub App
// flow) is required, this needs replacing with an RS256 JWT signer against
// the App's .pem private key — flag before relying on this for anything
// that needs installation-level scoping or revocation.

export interface GithubTokenAdapterConfig {
  /** A `github_pat_...` fine-grained personal access token. */
  token: string;
}

export class GithubTokenAdapter {
  static MANIFEST = {
    id: 'GithubToken.adapter',
    type: 'adapter',
    version: '1.0.0',
    runtime: 'Universal',
    capabilities: ['github:auth'],
    dependencies: [],
    docs: {
      description:
        'Provides GitHub API auth headers. Currently PAT-based (see file header) — not the full GitHub App JWT/installation-token flow.'
    },
    last_modified: '2026-07-13T00:00:00Z',
    layer: 3,
    requires: [],
    dataFiles: [],
    lifecycle: ['init', 'run', 'dispose'],
    actions: { commands: {}, events: {}, accepts: {}, slots: {} },
    operationalRole: 'registrar',
    optimization: { priority: 'high', assertionSuite: 'strict' },
    compliance: { partial: true, reason: 'PAT stand-in for GitHub App installation tokens; revisit if per-installation scoping is required.' }
  };

  private registry: unknown;
  private config: GithubTokenAdapterConfig | null = null;

  constructor(registry?: unknown) {
    this.registry = registry;
  }

  init(registry: unknown) {
    this.registry = registry;
    return { ok: true, data: { status: 'GithubTokenAdapter initialized' } };
  }

  run(payload: { action: 'configure'; config: GithubTokenAdapterConfig } | { action: 'getAuthHeader' }) {
    switch (payload.action) {
      case 'configure':
        this.config = payload.config;
        return { ok: true, data: { status: 'configured' } };
      case 'getAuthHeader': {
        if (!this.config) {
          return { ok: false, error: 'GithubTokenAdapter.run(getAuthHeader) called before configure' };
        }
        return { ok: true, data: { header: `Bearer ${this.config.token}` } };
      }
      default:
        return { ok: false, error: `Unknown action: ${JSON.stringify(payload)}` };
    }
  }

  dispose() {
    this.config = null;
    this.registry = null;
    return { ok: true };
  }
}

export default GithubTokenAdapter;
