import crypto from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";
import { updatePRStatusByUrl, updatePRCIStatusByUrl } from "../fisp/storeProposal";
import { db } from "../fisp/database";
import { logger } from "../utils/logger";
import { supabase } from "../utils/supabase";

export const MANIFEST = {
  id: "webhooks.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "githubWebhook"
  ],
  dependencies: [
    "node:crypto",
    "node:http",
    "../fisp/storeProposal",
    "../fisp/database",
    "../utils/logger",
    "../utils/supabase"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};



const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

export async function githubWebhook(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end("Method Not Allowed");
  }

  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    const rawBody = Buffer.concat(chunks);
    const signature = req.headers["x-hub-signature-256"] as string;

    if (WEBHOOK_SECRET && signature) {
      const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
      const digest = "sha256=" + hmac.update(rawBody).digest("hex");
      if (signature !== digest) {
        logger.warn("Invalid GitHub webhook signature");
        res.statusCode = 401;
        return res.end("Unauthorized");
      }
    }

    try {
      const payload = JSON.parse(rawBody.toString("utf8"));
      const event = req.headers["x-github-event"];

      if (event === "pull_request") await handlePullRequest(payload);
      else if (event === "check_run") await handleCheckRun(payload);
      else if (event === "installation") handleInstallation(payload);
      else if (event === "installation_repositories") handleInstallationRepositories(payload);

      res.statusCode = 200;
      res.end("OK");
    } catch (err: any) {
      logger.error("Failed to process webhook:", err);
      res.statusCode = 500;
      res.end("Internal Error");
    }
  });
}

async function handlePullRequest(payload: any) {
  const prUrl = payload.pull_request?.html_url;
  let status = payload.pull_request?.state === "open" ? "open" : "closed";
  
  if (payload.action === "closed") {
    status = payload.pull_request?.merged ? "merged" : "closed";
  }
  
  if (prUrl) {
    updatePRStatusByUrl(prUrl, status);
    if (supabase && typeof supabase.from === 'function') {
      try {
        await supabase.from("pr_metadata").update({ status }).eq("prUrl", prUrl);
      } catch (e) {
        logger.warn("Failed to sync PR status to Supabase:", e);
      }
    }
    logger.info(`Updated PR status for ${prUrl} to ${status}`);
  }
}

async function handleCheckRun(payload: any) {
  const checkRun = payload.check_run;
  const status = checkRun?.status;
  const conclusion = checkRun?.conclusion;
  const htmlUrl = checkRun?.html_url;

  let ciStatus = status === "completed" ? conclusion : status;
  
  const pullRequests = checkRun?.pull_requests || [];
  for (const pr of pullRequests) {
    const prUrl = pr.url.replace("api.github.com/repos", "github.com").replace("/pulls/", "/pull/");
    updatePRCIStatusByUrl(prUrl, ciStatus, htmlUrl);
    if (supabase && typeof supabase.from === 'function') {
      try {
        await supabase.from("pr_metadata").update({ ci_status: ciStatus, ci_log_url: htmlUrl }).eq("prUrl", prUrl);
      } catch (e) {
        logger.warn("Failed to sync CI status to Supabase:", e);
      }
    }
    logger.info(`Updated CI status for ${prUrl} to ${ciStatus}`);
  }
}

function handleInstallation(payload: any) {
  const action = payload.action;
  const instId = payload.installation?.id;
  const account = payload.installation?.account?.login;

  if (action === "created") {
    const repos = payload.repositories?.map((r: any) => r.full_name) || [];
    db.prepare('INSERT OR REPLACE INTO github_installations (installation_id, account_name, repositories) VALUES (?, ?, ?)').run(instId, account, JSON.stringify(repos));
  } else if (action === "deleted") {
    db.prepare('DELETE FROM github_installations WHERE installation_id = ?').run(instId);
  }
}

function handleInstallationRepositories(payload: any) {
  const instId = payload.installation?.id;
  const added = payload.repositories_added?.map((r: any) => r.full_name) || [];
  const removed = payload.repositories_removed?.map((r: any) => r.full_name) || [];
  
  const existing = db.prepare('SELECT repositories FROM github_installations WHERE installation_id = ?').get(instId) as any;
  if (existing) {
    let repos = JSON.parse(existing.repositories);
    repos = repos.filter((r: string) => !removed.includes(r));
    repos = [...new Set([...repos, ...added])];
    db.prepare('UPDATE github_installations SET repositories = ? WHERE installation_id = ?').run(JSON.stringify(repos), instId);
  }
}
