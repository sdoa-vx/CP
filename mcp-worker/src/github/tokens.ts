import * as jose from "jose";
import type { Env } from "../lib/supabase";

/**
 * Generate a GitHub App JWT using the `jose` library (Web Crypto compatible).
 * The private key is stored as a base64-encoded Wrangler secret.
 */
export async function createAppJWT(env: Env): Promise<string> {
  const privateKeyPem = atob(env.GITHUB_PRIVATE_KEY_BASE64);
  const privateKey = await jose.importPKCS8(privateKeyPem, "RS256");

  const now = Math.floor(Date.now() / 1000);

  const jwt = await new jose.SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 600)
    .setIssuer(env.GITHUB_APP_ID)
    .sign(privateKey);

  return jwt;
}

/**
 * Exchange a GitHub App JWT for a scoped installation access token.
 */
export async function createInstallationToken(
  installationId: number,
  env: Env
): Promise<string> {
  const jwt = await createAppJWT(env);

  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "SDOA-MCP-Worker/1.0",
      },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to create installation token: ${res.status} ${body}`
    );
  }

  const data: any = await res.json();
  return data.token;
}
