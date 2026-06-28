import { config } from 'dotenv';
import { db } from '../server/src/fisp/database';
import { createInstallationToken } from '../server/src/github/tokens';


export const MANIFEST = {
  id: "testGithub.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "createInstallationToken",
    "prepare",
    "fetch",
    "json",
    "get"
  ],
  dependencies: [
    "dotenv",
    "../server/src/fisp/database",
    "../server/src/github/tokens"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};


config();

async function runTest() {
  console.log("Testing GitHub Pipeline connection...");
  
  let token = process.env.GITHUB_TOKEN;
  let owner = process.env.GITHUB_OWNER || 'sdoa-vx';
  let repo = process.env.GITHUB_REPO || 'CP';

  if (!token) {
    console.log("No GITHUB_TOKEN in .env. Checking local database for GitHub App Installations...");
    try {
      const inst = db.prepare('SELECT installation_id FROM github_installations LIMIT 1').get() as any;
      if (inst?.installation_id) {
        console.log(`Found Installation ID: ${inst.installation_id}. Generating App Token...`);
        token = await createInstallationToken(inst.installation_id);
      } else {
        console.log("No installation_id found in the github_installations table.");
      }
    } catch (err: any) {
      console.log("Failed to query github_installations:", err.message);
    }
  }

  if (!token) {
    console.error("❌ Missing GitHub Token (Neither GITHUB_TOKEN env var nor DB Installation ID found).");
    console.error("   The PR worker requires GitHub authorization to open pull requests.");
    process.exit(1);
  }

  try {
    console.log(`\n--- Testing access to repository: ${owner}/${repo} ---`);
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { 
        Authorization: `token ${token}`,
        "User-Agent": "SDOA-Test-Script",
        "Accept": "application/vnd.github.v3+json"
      }
    });

    if (!repoRes.ok) {
      console.error(`❌ Failed to fetch repository. Status: ${repoRes.status}`);
      console.error(await repoRes.text());
      return;
    }

    const repoData = await repoRes.json();
    console.log(`✅ Successfully connected to GitHub API!`);
    console.log(`   Repository Name: ${repoData.full_name}`);
    console.log(`   Default Branch: ${repoData.default_branch}`);
    
    if (repoData.permissions) {
       console.log(`   Permissions: ${JSON.stringify(repoData.permissions)}`);
       if (repoData.permissions.push || repoData.permissions.admin) {
         console.log(`✅ Token has PUSH access. PR creation will work!`);
       } else {
         console.log(`⚠️ Token DOES NOT have PUSH access. PR creation may fail.`);
       }
    } else {
       console.log(`⚠️ Warning: GitHub did not return permission data for this token.`);
    }

    console.log("\n🎉 GITHUB TEST PASSED! The PR pipeline has valid connectivity.");

  } catch (err: any) {
    console.error("❌ Network or Execution Error:", err.message);
  }
}

runTest();
