// ──────────────────────────────────────────────────────────────────
// File:    WorkflowResult.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// SDOA Version
exports.VERSION = "1.0.0";
exports.getVersion = () => exports.VERSION;

class WorkflowResult {

    static MANIFEST = {
        id:           "WorkflowResult",
        type:         "workflow",
        runtime:      "NodeJS",
        version:      "1.0.0",
        capabilities: [],
        dependencies: [],
        docs: {
            description: "Manages WorkflowResult operations.",
            author: "ProtoAI team",
        },
        actions: {
            commands:  {},
            triggers:  {},
            emits:     {},
            workflows: {},
        },
    };

    constructor(status, data, error = null) {
        this.status = status;      // "ok" | "error"
        this.data = data || null;
        this.error = error;
        this.version = exports.VERSION;
    }

    static ok(data) {
        return new WorkflowResult("ok", data, null);
    }

    static error(error) {
        return new WorkflowResult("error", null, error instanceof Error ? error.message : error);
    }
}

module.exports = WorkflowResult;
