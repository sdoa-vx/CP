// ──────────────────────────────────────────────────────────────────
// File:    IngestWorkflow.js
// Version: 1.1.3
// Updated: 2026-06-25T00:00:00Z
// Changes: Added required MANIFEST.type ("workflow"); rescued from D: to portfolio.
//
// ARCHIVED (Phase 6/7 governance cleanup, 2026-07-15): moved from
// substrate/workflows/ to evolution/legacy/. This module requires
// "../base/sdoa-base.js", which does not exist anywhere in the repo --
// loading this file throws MODULE_NOT_FOUND. It was also never
// registered in registerWorkflows.js. Its one call site
// (FileContext.workflow.js) has been repointed to Ingest.workflow.js,
// the correct, functional module with a matching run()/search() API.
// Kept here for historical reference only -- do not re-wire without
// first fixing the missing base-class dependency.
// ──────────────────────────────────────────────────────────────────
// SDOA v1.2 compliant — Background Sync Task
const { Task } = require('../base/sdoa-base.js');

class IngestWorkflow extends Task {
    static MANIFEST = {
        id: "IngestWorkflow.workflow",
        type: "workflow",
        layer: 3,
        runtime: "NodeJS",
        version: "1.1.4",
        capabilities: ["ingest:reindex", "ingest:deep-scan-reembed"],
        dependencies: ["QmdAdapter", "BackendConnector"],
        docs: {
            description: "Background sync task that reindexes the active project's vector collection via QmdAdapter and BackendConnector, optionally triggering deep semantic re-embedding.",
            author: "ProtoAI team",
        },
        last_modified: "2026-07-13T00:00:00Z",
    };

    async run(payload = { deep_scan: false }) {
        const qmd = this.registry.get("QmdAdapter");
        const backend = this.registry.get("BackendConnector");

        // 1. Get the current project root from the global state
        const projectRoot = await backend.runWorkflow("get_active_project_root");
        if (!projectRoot) throw new Error("No active project to ingest.");

        console.log(`SDOA Ingest: Indexing ${projectRoot}`);

        // 2. Refresh the vector collection via Adapter
        await qmd.index(projectRoot);

        // 3. Handle Deep Scan (Heavy Reasoning for embeddings)
        if (payload.deep_scan) {
            this.bump_patch("Triggering deep semantic re-embedding.");
            await qmd.reEmbedAll();
        }

        return { status: "success", timestamp: Date.now() };
    }
}

module.exports = IngestWorkflow;
