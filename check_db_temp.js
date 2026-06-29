const db = require("better-sqlite3")("C:/Users/trech/.antigravity-ide/extensions/sdoa-vx.sdoa-mcp-extension-1.2.0/.sdoa/pipeline.db");
// Check a few queue items to understand the error
const items = db.prepare("SELECT id, type, target, created_at FROM offline_queue ORDER BY id DESC LIMIT 5").all();
console.log("Recent queue items:", JSON.stringify(items, null, 2));
// Check if there are any sync errors in the DB
const metaAll = db.prepare("SELECT * FROM metadata_store").all();
console.log("All metadata:", JSON.stringify(metaAll));
