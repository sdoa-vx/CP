// ──────────────────────────────────────────────────────────────────
// File:    WorkflowRegistry.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
"use strict";

class WorkflowRegistry {

    static MANIFEST = {
        id:           "WorkflowRegistry",
        type:         "workflow",
        runtime:      "NodeJS",
        version:      "1.0.0",
        capabilities: [],
        dependencies: [],
        docs: {
            description: "Manages WorkflowRegistry operations.",
            author: "ProtoAI team",
        },
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
