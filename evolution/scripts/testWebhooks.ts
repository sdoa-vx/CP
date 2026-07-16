import "dotenv/config";
import crypto from "crypto";
import Database from "better-sqlite3";

const PORT = process.env.PORT || 8080;
const SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";

async function sendWebhook(event: string, payload: any) {
  const body = JSON.stringify(payload);
  const headers: any = {
    "Content-Type": "application/json",
    "x-github-event": event,
  };

  if (SECRET) {
    const signature = crypto.createHmac("sha256", SECRET).update(body).digest("hex");
    headers["x-hub-signature-256"] = `sha256=${signature}`;
  }

  console.log(`Sending webhook [${event}]...`);
  try {
    const res = await fetch(`http://localhost:${PORT}/api/github/webhooks`, {
      method: "POST",
      headers,
      body,
    });
    console.log(`Response: ${res.status} ${res.statusText}`);
    const text = await res.text();
    console.log(`Body: ${text}\n`);
  } catch (e: any) {
    console.error(`Failed to send webhook: ${e.message}\n`);
  }
}

async function runTests() {
  console.log("Starting GitHub Webhook simulation tests...\n");

  // Fetch the latest proposal ID from SQLite DB to run realistic correlation checks
  const db = new Database(".sdoa/pipeline.db");
  
  // Let's seed a mock proposal if none exists
  db.prepare(`
    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY,
      status TEXT,
      data TEXT,
      timestamp TEXT,
      notes TEXT
    )
  `).run();

  let proposal = db.prepare("SELECT id FROM proposals ORDER BY timestamp DESC LIMIT 1").get() as any;
  if (!proposal) {
    console.log("Seeding mock proposal 'mock-proposal-123' for correlation tests...");
    db.prepare("INSERT INTO proposals (id, status, data, timestamp) VALUES (?, ?, ?, ?)")
      .run("mock-proposal-123", "queued", JSON.stringify({ proposalId: "mock-proposal-123" }), new Date().toISOString());
    proposal = { id: "mock-proposal-123" };
  }

  const proposalId = proposal.id;
  console.log(`Using proposal ID: ${proposalId} for testing.`);

  // 1. Emulate Installation Created
  await sendWebhook("installation", {
    action: "created",
    installation: {
      id: 99999,
      account: {
        login: "test-org-account"
      }
    }
  });

  // Verify Installation table updated
  let inst = db.prepare("SELECT * FROM github_installations WHERE installation_id = 99999").get() as any;
  if (inst && inst.account_name === "test-org-account") {
    console.log("✅ SUCCESS: github_installations entry found.");
  } else {
    console.error("❌ FAILED: github_installations entry missing.");
  }

  // 2. Emulate Installation Repositories Added
  await sendWebhook("installation_repositories", {
    action: "added",
    installation: {
      id: 99999
    },
    repositories_added: [
      { full_name: "test-org-account/sdoa-repo-a" },
      { full_name: "test-org-account/sdoa-repo-b" }
    ]
  });

  inst = db.prepare("SELECT * FROM github_installations WHERE installation_id = 99999").get() as any;
  if (inst && inst.repositories.includes("sdoa-repo-a")) {
    console.log("✅ SUCCESS: repositories updated in DB.");
  } else {
    console.error("❌ FAILED: repositories missing from DB.");
  }

  // 3. Emulate PR Opened (Correlated)
  await sendWebhook("pull_request", {
    action: "opened",
    pull_request: {
      html_url: "https://github.com/test-org-account/sdoa-repo-a/pull/10",
      head: {
        ref: `proposal/${proposalId}-feature-auth`
      },
      body: `Testing webhook correlation.\nProposal ID: ${proposalId}`
    }
  });

  let prMeta = db.prepare("SELECT * FROM pr_metadata WHERE proposalId = ?").get(proposalId) as any;
  if (prMeta && prMeta.status === "open" && prMeta.prUrl === "https://github.com/test-org-account/sdoa-repo-a/pull/10") {
    console.log("✅ SUCCESS: PR correlated & pr_metadata populated.");
  } else {
    console.error("❌ FAILED: pr_metadata correlation failed.");
  }

  // 4. Emulate check_run completed (CI outcome feedback)
  await sendWebhook("check_run", {
    check_run: {
      status: "completed",
      conclusion: "success",
      html_url: "https://github.com/test-org-account/sdoa-repo-a/actions/runs/888",
      pull_requests: [
        {
          url: "https://api.github.com/repos/test-org-account/sdoa-repo-a/pulls/10"
        }
      ]
    }
  });

  prMeta = db.prepare("SELECT * FROM pr_metadata WHERE proposalId = ?").get(proposalId) as any;
  if (prMeta && prMeta.ci_status === "success" && prMeta.ci_log_url === "https://github.com/test-org-account/sdoa-repo-a/actions/runs/888") {
    console.log("✅ SUCCESS: CI status reflected in pr_metadata.");
  } else {
    console.error("❌ FAILED: CI status update failed.");
  }

  // 5. Emulate PR Closed (Merged -> proposal promoted to accepted)
  await sendWebhook("pull_request", {
    action: "closed",
    pull_request: {
      html_url: "https://github.com/test-org-account/sdoa-repo-a/pull/10",
      merged: true,
      head: {
        ref: `proposal/${proposalId}-feature-auth`
      },
      body: `Proposal ID: ${proposalId}`
    }
  });

  const prop = db.prepare("SELECT * FROM proposals WHERE id = ?").get(proposalId) as any;
  prMeta = db.prepare("SELECT * FROM pr_metadata WHERE proposalId = ?").get(proposalId) as any;
  
  if (prop && prop.status === "accepted" && prMeta && prMeta.status === "merged") {
    console.log("✅ SUCCESS: Proposal promoted to 'accepted' state upon merge!");
  } else {
    console.error("❌ FAILED: Proposal merge lifecycle promotion failed.");
  }
}

runTests().catch(console.error);
