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
        id:           "WorkflowResult.utility",
        type:         "utility",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["workflow:result-wrapper"],
        dependencies: [],
        docs: {
            description: "Standard { status, data, error } result envelope used by workflow run() methods, with ok()/error() static constructors.",
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
