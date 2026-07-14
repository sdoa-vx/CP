// ──────────────────────────────────────────────────────────────────
// File:    paths.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure (substrate/access/env/)
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-05-13
const path = require("path");
const fs   = require("fs");

class PathResolver {

    static MANIFEST = {
        id:           "PathResolver.service",
        type:         "service",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["paths:resolve-root", "paths:data-directories", "paths:vfs-paths", "paths:memory-paths"],
        dependencies: [],
        docs: {
            description: "Resolves canonical filesystem paths for data, projects, memory, and VFS storage relative to an auto-detected ProtoAI root directory.",
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
        let root = process.env.PROTOAI_ROOT || process.cwd();

        // SDOA v4 Smart Root: Upward traversal to find the ProtoAI base directory
        // This handles cases where we are running deep inside src-tauri/target/debug
        if (!process.env.PROTOAI_ROOT) {
            let current = root;
            while (current && current !== path.parse(current).root) {
                // If we find 'data' and 'config' in the same place, that's likely the root
                if (fs.existsSync(path.join(current, "data")) && fs.existsSync(path.join(current, "config"))) {
                    root = current;
                    break;
                }
                // Fallback: if we are in a tauri-app folder, go up to the protoai parent
                if (path.basename(current).toLowerCase() === "tauri-app") {
                    root = path.join(current, "..");
                    break;
                }
                current = path.join(current, "..");
            }
        }

        this.root = root;
    }

  resolve(...parts) {
    return path.join(this.root, ...parts);
  }

  // Core directories
  data(...p) {
    return this.resolve("data", ...p);
  }

  projects(...p) {
    return this.data("projects", ...p);
  }

  cli(...p) {
    return this.resolve("cli", ...p);
  }

  ui(...p) {
    return this.resolve("ui", ...p);
  }

  runtime(...p) {
    return this.resolve("runtime", ...p);
  }

  // Specific files
  secretKey() {
    return this.data("secret.key");
  }

  profiles() {
    return this.cli("helpers", "profiles.json");
  }

  // Cognitive Layers (v2.1)
  memoryRoot() {
    return this.resolve("protoai", "memory");
  }

  identityMemory() {
    return path.join(this.memoryRoot(), "identity.json");
  }

  wisdomMemory() {
    return path.join(this.memoryRoot(), "wisdom.json");
  }

  workflowMemory(id) {
    return path.join(this.memoryRoot(), "workflows", `${id}.json`);
  }

  knowledgeDir() {
    return this.resolve("protoai", "knowledge");
  }

  ephemeralDir() {
    return this.resolve("protoai", "tmp", "session");
  }

  // Project Layer
  projectMemory(project) {
    return this.data("projects", project, "memory", "project.json");
  }

  projectKnowledge(project) {
    return this.data("projects", project, "knowledge");
  }

  projectDir(project) {
    return this.data("projects", project);
  }

  userProfiles(...p) {
    return this.resolve("protoai", "profiles", ...p);
  }

  userProfile() {
    return this.resolve("protoai", "memory", "identity.json");
  }

  archetypes(...p) {
    return this.data("archetypes", ...p);
  }

  // ── VFS paths ─────────────────────────────────────────────
  vfs(project, ...p)          { return this.resolve("projects", project, "vfs", ...p); }
  vfsIndex(project)           { return this.vfs(project, "index.json"); }
  vfsManifests(project)       { return this.vfs(project, "manifests"); }
  vfsManifest(project, id)    { return this.vfs(project, "manifests", id + ".json"); }
  // ── end of VFS paths ─────────────────────────────────────
}

module.exports = new PathResolver();
