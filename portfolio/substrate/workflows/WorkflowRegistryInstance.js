// ──────────────────────────────────────────────────────────────────
// File:    WorkflowRegistryInstance.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// SDOA Version
exports.VERSION = "1.0.0";
exports.getVersion = () => exports.VERSION;

class WorkflowRegistry {

    static MANIFEST = {
        id:           "WorkflowRegistryInstance.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["workflow:register-class", "workflow:instantiate", "workflow:list"],
        dependencies: [],
        docs: {
            description: "Shared singleton registry that maps workflow names to their classes and instantiates a fresh instance per get() call. Used by registerWorkflows.js and consumers like VersionInfoWorkflow.",
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
        this.workflows = new Map();
    }

    register(name, WorkflowClass) {
        this.workflows.set(name, WorkflowClass);
    }

    has(name) {
        return this.workflows.has(name);
    }

    get(name) {
        const WorkflowClass = this.workflows.get(name);
        if (!WorkflowClass) {
            throw new Error(`Workflow not registered: ${name}`);
        }
        return new WorkflowClass();
    }

    list() {
        return Array.from(this.workflows.keys());
    }
}

const registry = new WorkflowRegistry();
module.exports = registry;
