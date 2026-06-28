import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';


export const MANIFEST = {
  id: "testSupabase.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "@supabase/supabase-js",
    "crypto"
  ],
  dependencies: [
    "dotenv",
    "@supabase/supabase-js",
    "crypto"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};


config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(url, key);

async function runTest() {
  console.log("Testing Supabase connection for SDOA telemetry tables...");
  const fakeWorkspaceHash = crypto.randomBytes(8).toString('hex');
  
  // 1. Test sdoa_portfolio
  console.log("\n--- Testing sdoa_portfolio ---");
  const pData = {
    module_id: "test.module." + Date.now(),
    type: "test",
    file_path: "test/path.ts",
    source_code: "// test code",
    workspace_hash: fakeWorkspaceHash,
    file_hash: crypto.createHash('sha256').update("// test code").digest('hex'),
    version: "1.0.0"
  };
  
  let { error: pErr } = await supabase.from('sdoa_portfolio').insert(pData);
  if (pErr) console.error("❌ Failed sdoa_portfolio:", pErr.message);
  else console.log("✅ Successfully inserted into sdoa_portfolio");

  // 2. Test portfolio_usage
  console.log("\n--- Testing portfolio_usage ---");
  const uData = {
    workspace_hash: fakeWorkspaceHash,
    primitive_count: 1,
    workflow_count: 2,
    schema_count: 3,
    token_count: 4,
    engine_count: 5
  };
  let { error: uErr } = await supabase.from('portfolio_usage').insert(uData);
  if (uErr) console.error("❌ Failed portfolio_usage:", uErr.message);
  else console.log("✅ Successfully inserted into portfolio_usage");

  // 3. Test innovation_events
  console.log("\n--- Testing innovation_events ---");
  const iData = {
    workspace_hash: fakeWorkspaceHash,
    detector: "test_detector",
    file_path: "test/path.ts",
    matches: 1,
    ast_signature: "test_ast_123"
  };
  let { error: iErr } = await supabase.from('innovation_events').insert(iData);
  if (iErr) console.error("❌ Failed innovation_events:", iErr.message);
  else console.log("✅ Successfully inserted into innovation_events");
  
  if (!pErr && !uErr && !iErr) {
    console.log("\n🎉 ALL TESTS PASSED! Supabase tables are perfectly configured.");
  } else {
    console.log("\n⚠️ SOME TESTS FAILED. Please review the errors above.");
  }
}

runTest();
