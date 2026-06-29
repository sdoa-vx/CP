
const path = require('path');

// The running extension stores the DB here
const DB_PATH = path.join(
  process.env.LOCALAPPDATA || process.env.USERPROFILE,
  '..',
  '..',
  'Users', process.env.USERNAME || 'trech',
  '.antigravity-ide', 'extensions',
  'sdoa-vx.sdoa-mcp-extension-1.2.0', '.sdoa', 'pipeline.db'
);

// Try the known absolute path first
const KNOWN_PATH = 'C:\\Users\\trech\\.antigravity-ide\\extensions\\sdoa-vx.sdoa-mcp-extension-1.2.0\\.sdoa\\pipeline.db';

const db = require('better-sqlite3')(KNOWN_PATH);

const before = db.prepare('SELECT COUNT(*) as c FROM offline_queue').get().c;
console.log(`Queue depth before: ${before}`);

if (before === 0) {
  console.log('Queue already empty.');
  process.exit(0);
}

const { changes } = db.prepare('DELETE FROM offline_queue').run();
console.log(`Deleted ${changes} items.`);

const after = db.prepare('SELECT COUNT(*) as c FROM offline_queue').get().c;
console.log(`Queue depth after: ${after}`);
console.log('Done. Restart the engine from the dashboard to reset sync status.');
