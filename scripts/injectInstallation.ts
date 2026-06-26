import fs from "fs";
import path from "path";

process.env.GITHUB_PRIVATE_KEY_PATH = "./keys/sdoa-autopr.2026-06-21.private-key.pem";
process.env.GITHUB_APP_ID = "4112812";

import { createAppJWT } from "../server/src/github/tokens";
import { db } from "../server/src/fisp/database";


export const MANIFEST = {
  id: "injectInstallation.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "fs",
    "path",
    "createAppJWT",
    "db"
  ],
  dependencies: [
    "fs",
    "path",
    "../server/src/github/tokens",
    "../server/src/fisp/database"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};



async function main() {
  console.log("Generating JWT...");
  const jwt = await createAppJWT();

  console.log("Fetching installations from GitHub API...");
  const res = await fetch("https://api.github.com/app/installations", {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "SDOA-MCP"
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch installations: ${res.status} ${await res.text()}`);
  }

  const installations = await res.json();
  if (!installations || installations.length === 0) {
    console.log("No installations found on GitHub. Did you install the app on a repo?");
    return;
  }

  const inst = installations[0];
  const instId = inst.id;
  const account = inst.account.login;
  const repos = inst.repository_selection === "all" ? ["*"] : [];
  
  console.log(`Found Installation ID: ${instId} for account ${account}`);

  const existing = db.prepare("SELECT * FROM github_installations WHERE installation_id = ?").get(instId.toString());
  if (!existing) {
    db.prepare(`
      INSERT INTO github_installations (installation_id, account_name, repository_selection, permissions, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      instId.toString(),
      account,
      inst.repository_selection,
      JSON.stringify(inst.permissions),
      new Date().toISOString()
    );
    console.log(`SUCCESS! Inserted installation ${instId} into the local database.`);
  } else {
    console.log("Installation already exists in the database.");
  }
}

main().catch(console.error);
