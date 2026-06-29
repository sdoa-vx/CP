const { createClient } = require('@supabase/supabase-js');

function deobfuscate(encoded) {
  return Buffer.from(encoded, 'base64').toString('utf8');
}

const obfuscatedUrl = "aHR0cHM6Ly9jdmVzenZnd2xiZWh6ZmdidWtudy5zdXBhYmFzZS5jbw==";
const obfuscatedKey = "c2Jfc2VjcmV0X3ZBZ1V6bFdwa0JJcTF0MmFtbXRDN0FfZ2ppQXRLb2w=";

const url = deobfuscate(obfuscatedUrl);
const key = deobfuscate(obfuscatedKey);

const supabase = createClient(url, key);

async function test() {
  console.log("Testing innovation_events...");
  const { error: e1 } = await supabase.from('innovation_events').insert({
    workspace_hash: 'test',
    detector: 'test',
    file_path: 'test',
    matches: 1,
    ast_signature: null,
    created_at: new Date().toISOString()
  });
  console.log("e1:", e1);

  console.log("Testing portfolio_usage...");
  const { error: e2 } = await supabase.from('portfolio_usage').insert({
    workspace_hash: 'test',
    primitive_count: 0,
    workflow_count: 0,
    schema_count: 0,
    token_count: 0,
    engine_count: 0,
    updated_at: new Date().toISOString()
  });
  console.log("e2:", e2);
}

test();
