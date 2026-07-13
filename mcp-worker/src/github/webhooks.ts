import { Hono } from "hono";
import type { Env } from "../lib/supabase";
import { createSupabaseClient } from "../lib/supabase";

const webhooks = new Hono<{ Bindings: Env }>();

/**
 * Verify GitHub webhook signature using Web Crypto API (Workers-compatible).
 * Uses HMAC-SHA256 with the GITHUB_WEBHOOK_SECRET.
 */
async function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!secret) return true; // No secret configured — bypass (dev only)
  if (!signatureHeader) return false;

  const signature = signatureHeader.replace("sha256=", "");

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody)
  );

  const computedHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (signature.length !== computedHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ computedHex.charCodeAt(i);
  }
  return mismatch === 0;
}

webhooks.post("/", async (c) => {
  const signatureHeader = c.req.header("x-hub-signature-256") || null;
  const event = c.req.header("x-github-event") || "";
  const rawBody = await c.req.text();

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const isValid = await verifySignature(
    rawBody,
    signatureHeader,
    c.env.GITHUB_WEBHOOK_SECRET
  );
  if (!isValid) {
    return c.json({ ok: false, error: "Invalid signature" }, 401);
  }

  const supabase = createSupabaseClient(c.env);

  try {
    // ─── Installation Events ────────────────────────────────────────────
    if (event === "installation") {
      const installationId = payload.installation?.id;
      const accountName = payload.installation?.account?.login;

      if (payload.action === "created" && installationId && accountName) {
        await supabase.from("github_installations").upsert(
          {
            installation_id: installationId,
            account_name: accountName,
            repositories: [],
            created_at: new Date().toISOString(),
          },
          { onConflict: "installation_id" }
        );
      } else if (payload.action === "deleted" && installationId) {
        await supabase
          .from("github_installations")
          .delete()
          .eq("installation_id", installationId);
      }
    }

    // ─── Installation Repositories ──────────────────────────────────────
    else if (event === "installation_repositories") {
      const installationId = payload.installation?.id;
      if (installationId) {
        const { data: row } = await supabase
          .from("github_installations")
          .select("repositories")
          .eq("installation_id", installationId)
          .single();

        let repos: string[] = row?.repositories || [];

        if (payload.repositories_added) {
          for (const r of payload.repositories_added) {
            if (!repos.includes(r.full_name)) repos.push(r.full_name);
          }
        }
        if (payload.repositories_removed) {
          const removed = payload.repositories_removed.map(
            (r: any) => r.full_name
          );
          repos = repos.filter((r) => !removed.includes(r));
        }

        await supabase
          .from("github_installations")
          .update({ repositories: repos })
          .eq("installation_id", installationId);
      }
    }

    // ─── Pull Request Events ────────────────────────────────────────────
    else if (event === "pull_request") {
      const action = payload.action;
      const pr = payload.pull_request;
      if (pr) {
        const prUrl = pr.html_url;
        const ref = pr.head?.ref || "";
        const body = pr.body || "";

        // Extract proposalId from body first (most reliable), then branch name
        let proposalId = "";
        const bodyMatch = body.match(/Proposal ID:\s*([A-Za-z0-9-]+)/i);
        const refMatch = ref.match(
          /proposal\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i
        );

        if (bodyMatch) proposalId = bodyMatch[1];
        else if (refMatch) proposalId = refMatch[1];

        if (proposalId) {
          if (action === "opened" || action === "reopened") {
            await supabase.from("pr_metadata").upsert(
              {
                proposal_id: proposalId,
                pr_url: prUrl,
                status: "open",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "proposal_id" }
            );
          } else if (action === "closed") {
            const isMerged = pr.merged === true;
            const newStatus = isMerged ? "merged" : "closed";

            await supabase
              .from("pr_metadata")
              .update({
                status: newStatus,
                updated_at: new Date().toISOString(),
              })
              .eq("pr_url", prUrl);

            // If merged, promote the proposal to 'accepted'
            if (isMerged) {
              await supabase
                .from("proposals")
                .update({
                  status: "accepted",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", proposalId);
            }
          }
        }
      }
    }

    // ─── Check Run Events (CI Feedback) ─────────────────────────────────
    else if (event === "check_run") {
      const checkRun = payload.check_run;
      if (checkRun && checkRun.status === "completed") {
        const conclusion = checkRun.conclusion;
        const logUrl = checkRun.html_url;
        const pullRequests = checkRun.pull_requests || [];

        for (const pr of pullRequests) {
          const prUrl = pr.url
            .replace("api.github.com/repos", "github.com")
            .replace("/pulls/", "/pull/");

          await supabase
            .from("pr_metadata")
            .update({
              ci_status: conclusion,
              ci_log_url: logUrl,
              updated_at: new Date().toISOString(),
            })
            .eq("pr_url", prUrl);
        }
      }
    }

    return c.json({ ok: true });
  } catch (error: any) {
    console.error("[Webhooks] Processing error:", error);
    return c.json({ ok: false, error: error.message }, 500);
  }
});

export default webhooks;
