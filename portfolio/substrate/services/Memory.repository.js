// ──────────────────────────────────────────────────────────────────
// File:    Memory.repository.js
// Version: 5.2.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure;
//          FIXED path: require("./paths") → require("../access/env/paths")
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-03 11:15 UTC
// Module Type: repository | Operational Role: savant
// Version: 5.2.0 | Runtime: NodeJS

"use strict";

const fs = require("fs");
const path = require("path");
const paths = require("../access/env/paths");

class MemoryRepository {
  static MANIFEST = {
    id: "Memory.repository",
    type: "repository",
    layer: 3,
    runtime: "NodeJS",
    version: "5.2.0",
    operationalRole: "savant",
    requires: [],
    capabilities: ["memory_read_raw", "memory_write_raw"],
    dependencies: [],
    lifecycle: ["init"],
    actions: {
      commands: {
        read: { description: "Reads and parses file contents safely from targeted namespace path." },
        write: { description: "Commits transactional data safely with backup creation." }
      },
      events: {},
      accepts: {}
    },
    optimization: {
      priority: "safety",
      assertionSuite: "MemoryRepository.tests.json"
    },
    docs: {
      description: "Isolated, drive-agnostic physical asset access layer featuring non-blocking async queueing and retention pruning.",
      author: "SDOA Core Architecture Group",
      sdoa: "5.0.0"
    }
  };

  async init(registry) {
    this.registry = registry;
    this.writeQueues = new Map();
    this.queueCounters = new Map(); // Tracks active listeners to prevent premature deletion memory leaks
  }

  async execute(commandName, payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("[Memory.repository] Payload must be a valid object.");
    }
    if (commandName === "read") {
      return await this.read(payload.namespace, payload.targetId);
    }
    if (commandName === "write") {
      await this.write(payload.namespace, payload.targetId, payload.data);
      return true;
    }
    throw new Error(`[Memory.repository] Prohibited Command Action: ${commandName}`);
  }

  resolvePath(namespace, targetId) {
    if (!targetId || typeof targetId !== "string" || targetId.includes("..")) {
      throw new Error("[Memory.repository] Invalid target ID sequence detected.");
    }
    if (namespace === "project") {
      return paths.projectMemory(targetId);
    } else if (namespace === "workflow") {
      return paths.workflowMemory(targetId);
    }
    return paths.identityMemory();
  }

  async read(namespace, targetId) {
    const filePath = this.resolvePath(namespace, targetId);
    try {
      const data = await fs.promises.readFile(filePath, "utf8");
      return JSON.parse(data);
    } catch (err) {
      if (err.code === "ENOENT") return [];
      console.error(`[MemoryRepository] Failed to read or parse JSON from ${filePath}:`, err.message);
      return [];
    }
  }

  async write(namespace, targetId, data) {
    const filePath = this.resolvePath(namespace, targetId);

    if (!this.writeQueues.has(filePath)) {
      this.writeQueues.set(filePath, Promise.resolve());
      this.queueCounters.set(filePath, 0);
    }

    // Increment active listener counter for this file path queue
    this.queueCounters.set(filePath, this.queueCounters.get(filePath) + 1);

    const currentQueue = this.writeQueues.get(filePath);
    const nextWrite = currentQueue.then(async () => {
      try {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

        let exists = false;
        try {
          await fs.promises.access(filePath);
          exists = true;
        } catch (_) {}

        if (exists) {
          const backupDir = path.join(path.dirname(filePath), "backups");
          await fs.promises.mkdir(backupDir, { recursive: true });
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          const fileName = path.basename(filePath);
          const backupPath = path.join(backupDir, `backup_${stamp}_${fileName}`);
          try {
            await fs.promises.copyFile(filePath, backupPath);

            // Prune old backups (keep only last 5)
            const files = await fs.promises.readdir(backupDir);
            const targetBackups = files
              .filter(f => f.endsWith(fileName) && f.startsWith("backup_"))
              .sort(); // Alphanumeric sort correctly sorts by ISO date stamps

            if (targetBackups.length > 5) {
              const toDelete = targetBackups.slice(0, targetBackups.length - 5);
              for (const fileToDelete of toDelete) {
                try {
                  await fs.promises.unlink(path.join(backupDir, fileToDelete));
                } catch (delErr) {
                  console.warn(`[MemoryRepository] Failed to delete old backup ${fileToDelete}:`, delErr.message);
                }
              }
            }
          } catch (err) {
            console.warn(`[MemoryRepository] Backup creation or pruning failed for ${filePath}:`, err.message);
          }
        }
        await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
      } finally {
        // Decrement listener counters when execution finishes
        const remaining = this.queueCounters.get(filePath) - 1;
        if (remaining <= 0) {
          this.writeQueues.delete(filePath); // Garbage collection cleanup to avoid system memory leak
          this.queueCounters.delete(filePath);
        } else {
          this.queueCounters.set(filePath, remaining);
        }
      }
    });

    this.writeQueues.set(filePath, nextWrite);
    await nextWrite;
  }
}

module.exports = MemoryRepository;
