// ──────────────────────────────────────────────────────────────────
// File:    WorkflowBase.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// SDOA Version
exports.VERSION = "1.0.0";
exports.getVersion = () => exports.VERSION;

class WorkflowBase {

    static MANIFEST = {
        id:           "WorkflowBase.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["workflow:base-contract"],
        dependencies: [],
        docs: {
            description: "Abstract base class for backend workflows, providing version/name accessors and the run() contract that subclasses must implement.",
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
        this.version = exports.VERSION;
    }

    getName() {
        return this.constructor.name;
    }

    getVersion() {
        return this.version;
    }

    // Override in subclasses
    async run(_payload) {
        throw new Error(`run() not implemented in ${this.getName()}`);
    }
}

module.exports = WorkflowBase;
