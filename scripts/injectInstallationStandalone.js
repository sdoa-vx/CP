
const MANIFEST = {
  id: "injectInstallationStandalone.js",
  type: "module",
  layer: 4,
  runtime: "JavaScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "fs",
    "path",
    "jsonwebtoken",
    "better-sqlite3"
  ],
  dependencies: [
    "fs",
    "path",
    "jsonwebtoken",
    "better-sqlite3"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const PRIVATE_KEY_PATH = path.join(__dirname, "..", "keys", "sdoa-autopr.2026-06-21.private-key.pem");
const APP_ID = "4112812";

async function main() {
  const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, "utf8");
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    { iat: now - 60, exp: now + 500, iss: APP_ID },
    privateKey,
    { algorithm: "RS256" }
  );

  console.log("Fetching installations...");
  const res = await fetch("https://api.github.com/app/installations", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "SDOA-MCP"
    }
  });

  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${await res.text()}`);

  const installations = await res.json();
  if (installations.length === 0) {
    console.log("No installations found on GitHub!");
    return;
  }

  const inst = installations[0];
  console.log(`Found Installation ID: ${inst.id} for account ${inst.account.login}`);

  const dbPath = path.join(__dirname, "..", ".sdoa", "pipeline.db");
  const db = new Database(dbPath);
  
  const existing = db.prepare("SELECT * FROM github_installations WHERE installation_id = ?").get(inst.id);
  if (!existing) {
    db.prepare(`
      INSERT INTO github_installations (installation_id, account_name, repositories)
      VALUES (?, ?, ?)
    `).run(
      inst.id,
      inst.account.login,
      inst.repository_selection
    );
    console.log("SUCCESS! Injected into local database.");
  } else {
    console.log("Installation already exists in DB.");
  }
}

main().catch(console.error);
