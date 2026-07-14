// ──────────────────────────────────────────────────────────────────
// File:    BaseRepository.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure (substrate/access/fs/)
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-05-04 03:11 UTC
const fs = require("fs-extra");

class BaseRepository {

    static MANIFEST = {
        id:           "BaseRepository.repository",
        type:         "repository",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["fs:read-json", "fs:write-json-queued", "fs:list-files"],
        dependencies: [],
        docs: {
            description: "Abstract base class providing queued JSON read/write, existence checks, and directory listing for all filesystem-backed repositories.",
            author: "ProtoAI team",
        },
        last_modified: "2026-07-13T00:00:00Z",
        actions: {
            commands:  {},
            triggers:  {},
            emits:     {},
            workflows: {},
        },
    };
      constructor(basePath) {
    this.basePath = basePath;
    fs.mkdirpSync(this.basePath);
    // Per-file write queues to prevent concurrent write corruption on Windows
    this._writeQueues = new Map();
  }

  readJson(filePath, fallback = null) {
    try {
      return fs.readJsonSync(filePath);
    } catch {
      return fallback;
    }
  }

  writeJson(filePath, data) {
    if (!this._writeQueues.has(filePath)) {
      this._writeQueues.set(filePath, Promise.resolve());
    }
    const queue = this._writeQueues.get(filePath);
    const next = queue.then(() => fs.writeJsonSync(filePath, data, { spaces: 2 }));
    this._writeQueues.set(filePath, next);
  }

  // Synchronous write bypass — use with caution
  writeJsonSync(filePath, data) {
    fs.writeJsonSync(filePath, data, { spaces: 2 });
  }

  fileExists(filePath) {
    return fs.existsSync(filePath);
  }

  listFiles(dirPath) {
    return fs.readdirSync(dirPath);
  }
}

module.exports = BaseRepository;
