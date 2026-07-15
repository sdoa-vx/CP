// ──────────────────────────────────────────────────────────────────
// File:    QuickAction.js
// Version: 1.0.3
// Updated: 2026-06-25T00:00:00Z
// Changes: Added required MANIFEST.type ("workflow"); rescued from D: to portfolio.
// ──────────────────────────────────────────────────────────────────
// SDOA v1.2 compliant — Execution Pipeline
const { Task } = require('../base/sdoa-base.js');

class QuickAction extends Task {
    static MANIFEST = {
        id: "QuickAction.workflow",
        type: "workflow",
        layer: 3,
        runtime: "NodeJS",    // Added for cross-runtime routing
        version: "1.0.4",    // Added for Registry tracking
        capabilities: ["refactor:quick-action"],
        dependencies: ["QmdAdapter", "LlmBridge", "RefactorService"],
        docs: {
            description: "Cross-runtime quick-fix pipeline: fetches code context via QmdAdapter, then delegates refactor proposal generation to the Python RefactorService for a given file and user intent.",
            author: "ProtoAI team",
        },
        last_modified: "2026-07-13T00:00:00Z",
    };

    async run({ filePath, userIntent }) {
        // 1. Fetch code via Adapter
        const qmd = this.registry.get("QmdAdapter");
        const code = await qmd.query(`SELECT content FROM snippets WHERE path = '${filePath}'`);

        // 2. Delegate logic to the Python-based RefactorService
        // This is a cross-runtime SDOA call!
        const refactor = await this.registry.get("RefactorService").propose_refactor(
            filePath,
            userIntent
        );

        this.bump_patch(`QuickAction: ${userIntent} executed on ${filePath}`);
        return refactor;
    }
}

module.exports = QuickAction;
