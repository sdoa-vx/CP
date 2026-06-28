// ──────────────────────────────────────────────────────────────────
// File:    IngestWorkflow.js
// Version: 1.1.3
// Updated: 2026-06-25T00:00:00Z
// Changes: Added required MANIFEST.type ("workflow"); rescued from D: to portfolio.
// ──────────────────────────────────────────────────────────────────
// SDOA v1.2 compliant — Background Sync Task
const { Task } = require('../base/sdoa-base.js');

class IngestWorkflow extends Task {
    static MANIFEST = {
        id: "IngestWorkflow",
        type: "workflow",
        runtime: "NodeJS",
        version: "1.1.3",
        dependencies: ["QmdAdapter", "BackendConnector"]
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
