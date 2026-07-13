import crypto from "crypto";
import { Router } from "../utils/Router";
import { db } from "../fisp/database";
import { savePRMetadataLocal, updatePRStatusByUrl, updatePRCIStatusByUrl } from "../fisp/storeProposal";
import { logger } from "../utils/logger";

export const MANIFEST = {
  id: "webhooks.ts",
  type: "module",
  layer: 3,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "conductor",
  optimization: { priority: "stability" },
  capabilities: [
    "/api/github/webhooks"
  ],
  dependencies: [
    "../utils/Router",
    "../fisp/database",
    "../fisp/storeProposal",
    "../utils/logger",
    "crypto"
  ],
  docs: "GitHub Webhook Event Ingestion and Proposal Lifecycle Automation Router"
};

const router = new Router();

function parseRawAndJsonBody(req: any): Promise<{ raw: string; json: any }> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk: any) => body += chunk.toString());
    req.on("end", () => {
      let json = {};
      try {
        json = JSON.parse(body || "{}");
      } catch (e) {}
      resolve({ raw: body, json });
    });
  });
}

function verifySignature(rawBody: string, signatureHeader: string | undefined): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("[Webhooks] GITHUB_WEBHOOK_SECRET not set. Bypassing signature verification.");
    return true;
  }
  if (!signatureHeader) return false;

  try {
    const signature = signatureHeader.replace("sha256=", "");
    const computedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    const sigBuffer = Buffer.from(signature, "hex");
    const compBuffer = Buffer.from(computedSignature, "hex");

    if (sigBuffer.length !== compBuffer.length) return false;
    return crypto.timingSafeEqual(sigBuffer, compBuffer);
  } catch (e) {
    return false;
  }
}

router.post("/", async (req, res) => {
  const signatureHeader = req.headers["x-hub-signature-256"] as string | undefined;
  const event = req.headers["x-github-event"] as string | undefined;

  const { raw, json: payload } = await parseRawAndJsonBody(req);

  if (!verifySignature(raw, signatureHeader)) {
    logger.error("[Webhooks] Webhook signature verification failed.");
    res.statusCode = 401;
    return res.end("Unauthorized: Invalid signature");
  }

  logger.info(`[Webhooks] Processing incoming GitHub event: ${event}`);

  try {
    if (event === "installation") {
      const installationId = payload.installation?.id;
      const accountName = payload.installation?.account?.login;

      if (payload.action === "created" && installationId && accountName) {
        db.prepare(`
          INSERT INTO github_installations (installation_id, account_name, repositories)
          VALUES (?, ?, ?)
          ON CONFLICT(installation_id) DO UPDATE SET account_name = excluded.account_name
        `).run(installationId, accountName, "[]");
        logger.info(`[Webhooks] Registered new installation: ID=${installationId}, Account=${accountName}`);
      } else if (payload.action === "deleted" && installationId) {
        db.prepare("DELETE FROM github_installations WHERE installation_id = ?").run(installationId);
        logger.info(`[Webhooks] Removed installation: ID=${installationId}`);
      }
    } 
    
    else if (event === "installation_repositories") {
      const installationId = payload.installation?.id;
      if (installationId) {
        const row = db.prepare("SELECT repositories FROM github_installations WHERE installation_id = ?").get(installationId) as any;
        let repos: string[] = [];
        if (row && row.repositories) {
          try { repos = JSON.parse(row.repositories); } catch(e) {}
        }

        if (payload.repositories_added) {
          for (const r of payload.repositories_added) {
            if (!repos.includes(r.full_name)) repos.push(r.full_name);
          }
        }
        if (payload.repositories_removed) {
          const removed = payload.repositories_removed.map((r: any) => r.full_name);
          repos = repos.filter(r => !removed.includes(r));
        }

        db.prepare("UPDATE github_installations SET repositories = ? WHERE installation_id = ?")
          .run(JSON.stringify(repos), installationId);
        logger.info(`[Webhooks] Updated installation repositories for ID=${installationId}`);
      }
    } 
    
    else if (event === "pull_request") {
      const action = payload.action;
      const pr = payload.pull_request;
      if (pr) {
        const prUrl = pr.html_url;
        const ref = pr.head?.ref || "";
        const body = pr.body || "";

        // Attempt to extract proposalId from ref (branch name: proposal/<uuid>)
        // or from body (text: Proposal ID: <uuid>)
        let proposalId = "";
        const bodyMatch = body.match(/Proposal ID:\s*([A-Za-z0-9-]+)/i);
        const refMatch = ref.match(/proposal\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);

        if (bodyMatch) proposalId = bodyMatch[1];
        else if (refMatch) proposalId = refMatch[1];

        if (proposalId) {
          if (action === "opened" || action === "reopened") {
            savePRMetadataLocal(proposalId, prUrl);
            logger.info(`[Webhooks] Correlated open PR to proposal ${proposalId}: ${prUrl}`);
          } else if (action === "closed") {
            const isMerged = pr.merged === true;
            updatePRStatusByUrl(prUrl, isMerged ? "merged" : "closed");
            logger.info(`[Webhooks] Closed PR correlated to proposal ${proposalId}. Merged=${isMerged}`);
          }
        } else {
          logger.warn(`[Webhooks] Could not find correlated SDOA Proposal ID in PR ref: "${ref}" or body.`);
        }
      }
    } 
    
    else if (event === "check_run") {
      const checkRun = payload.check_run;
      if (checkRun && checkRun.status === "completed") {
        const conclusion = checkRun.conclusion; // success, failure, etc.
        const logUrl = checkRun.html_url;
        const pullRequests = checkRun.pull_requests || [];

        for (const pr of pullRequests) {
          // Translate API url to HTML url
          const prUrl = pr.url
            .replace("api.github.com/repos", "github.com")
            .replace("/pulls/", "/pull/");
            
          updatePRCIStatusByUrl(prUrl, conclusion, logUrl);
          logger.info(`[Webhooks] Updated CI status for PR ${prUrl}: conclusion=${conclusion}`);
        }
      }
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true }));
  } catch (error: any) {
    logger.error("[Webhooks] Webhook processing exception:", error);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: error.message }));
  }
});

export default router;
