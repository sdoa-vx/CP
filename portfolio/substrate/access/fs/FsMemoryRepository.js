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
        id:           "FsMemoryRepository.repository",
        type:         "repository",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["memory:load-global", "memory:load-project", "memory:save-global", "memory:save-project"],
        dependencies: ["BaseRepository.repository", "PathResolver.service"],
        docs: {
            description: "Persists and loads global and per-project memory fact stores as JSON files under the data directory.",
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
