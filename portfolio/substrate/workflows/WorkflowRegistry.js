// ──────────────────────────────────────────────────────────────────
// File:    WorkflowRegistry.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
"use strict";

class WorkflowRegistry {

    static MANIFEST = {
        id:           "WorkflowRegistry.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["workflow:register", "workflow:lookup", "workflow:list"],
        dependencies: [],
        docs: {
            description: "In-memory registry mapping workflow names to instances (register/has/get/list). Not exported as a singleton — see WorkflowRegistryInstance.workflow for the shared instance used at runtime.",
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

    register(name, instance) {
        this.workflows.set(name, instance);
    }

    has(name) {
        return this.workflows.has(name);
    }

    get(name) {
        if (!this.workflows.has(name)) {
            throw new Error(`Workflow not registered: ${name}`);
        }
        return this.workflows.get(name);
    }

    list() {
        return Array.from(this.workflows.keys());
    }
}

module.exports = WorkflowRegistry;
