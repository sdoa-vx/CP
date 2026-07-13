import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client scoped to a single Worker request.
 * Uses the service role key (bypasses RLS) for all server-side operations.
 * 
 * IMPORTANT: Workers are stateless isolates — do NOT cache the client globally.
 * Create one per request using the env bindings.
 */
export function createSupabaseClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Environment bindings declared in wrangler.toml secrets.
 */
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY_BASE64: string;
  ENVIRONMENT: string;
  MCP_INTERNAL_SECRET: string;
  R2_BUCKET?: any;
}
