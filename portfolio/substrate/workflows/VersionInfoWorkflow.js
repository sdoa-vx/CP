// ──────────────────────────────────────────────────────────────────
// File:    VersionInfoWorkflow.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
const WorkflowBase = require("./WorkflowBase");
const WorkflowResult = require("./WorkflowResult");
const registry = require("./WorkflowRegistryInstance");

// SDOA Version
exports.VERSION = "1.0.0";
exports.getVersion = () => exports.VERSION;

class VersionInfoWorkflow extends WorkflowBase {

    static MANIFEST = {
        id:           "VersionInfoWorkflow",
        type:         "workflow",
        runtime:      "NodeJS",
        version:      "1.0.0",
        capabilities: [],
        dependencies: [],
        docs: {
            description: "Manages VersionInfoWorkflow operations.",
            author: "ProtoAI team",
        },
        actions: {
            commands:  {},
            triggers:  {},
            emits:     {},
            workflows: {},
        },
    };
      async run() {
    try {
      const workflows = registry.list().map(name => {
        const WorkflowClass = require(`./${name}`);
        const version = WorkflowClass.VERSION || "unknown";
        return { name, version };
      });

      return WorkflowResult.ok({
        sdoaVersion: exports.VERSION,
        workflows
      });
    } catch (err) {
      return WorkflowResult.error(err);
    }
  }
}

module.exports = VersionInfoWorkflow;
