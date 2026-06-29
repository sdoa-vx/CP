const { createClient } = require('@supabase/supabase-js');

function deobfuscate(encoded) {
  return Buffer.from(encoded, 'base64').toString('utf8');
}

const obfuscatedUrl = "aHR0cHM6Ly9jdmVzenZnd2xiZWh6ZmdidWtudy5zdXBhYmFzZS5jbw==";
const obfuscatedKey = "c2Jfc2VjcmV0X3ZBZ1V6bFdwa0JJcTF0MmFtbXRDN0FfZ2ppQXRLb2w=";

const url = deobfuscate(obfuscatedUrl);
const key = deobfuscate(obfuscatedKey);

const supabase = createClient(url, key);

async function fetchCounts() {
  const { count: innovationCount, error: e1 } = await supabase
    .from('innovation_events')
    .select('*', { count: 'exact', head: true });

  const { count: portfolioCount, error: e2 } = await supabase
    .from('sdoa_portfolio')
    .select('*', { count: 'exact', head: true });

  const { count: usageCount, error: e3 } = await supabase
    .from('portfolio_usage')
    .select('*', { count: 'exact', head: true });

  console.log("--- Supabase Data Counts ---");
  console.log("Potential Innovations Found (innovation_events):", innovationCount);
  console.log("Modules Located (sdoa_portfolio):", portfolioCount);
  console.log("Usage Records (portfolio_usage):", usageCount);
  
  if (e1 || e2 || e3) console.error("Errors encountered:", e1, e2, e3);
}

fetchCounts();
