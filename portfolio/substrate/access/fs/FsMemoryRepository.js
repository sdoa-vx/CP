// ──────────────────────────────────────────────────────────────────
// File:    FsMemoryRepository.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure (substrate/access/fs/)
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-05-04 03:11 UTC
const BaseRepository = require("./BaseRepository");
const paths = require("../env/paths");

class FsMemoryRepository extends BaseRepository {

    static MANIFEST = {
        id:           "FsMemoryRepository",
        type:         "service",
        runtime:      "NodeJS",
        version:      "1.0.0",
        capabilities: [],
        dependencies: [],
        docs: {
            description: "Manages FsMemoryRepository operations.",
            author: "ProtoAI team",
        },
        actions: {
            commands:  {},
            triggers:  {},
            emits:     {},
            workflows: {},
        },
    };
      constructor() {
    super(paths.data());
  }

  loadGlobalMemory() {
    return this.readJson(paths.globalMemory(), { facts: [] });
  }

  loadProjectMemory(project) {
    return this.readJson(paths.projectMemory(project), { facts: [] });
  }

  saveGlobalMemory(data) {
    this.writeJson(paths.globalMemory(), data);
  }

  saveProjectMemory(project, data) {
    this.writeJson(paths.projectMemory(project), data);
  }
}

module.exports = FsMemoryRepository;
