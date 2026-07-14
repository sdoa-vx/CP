// ──────────────────────────────────────────────────────────────────
// File:    LoadProjectHistoryWorkflow.js
// Version: 1.0.1
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
const fs = require("fs");
const WorkflowBase = require("./WorkflowBase");
const WorkflowResult = require("./WorkflowResult");
const paths = require("../access/env/paths");

// SDOA Version
exports.VERSION = "1.0.1";
exports.getVersion = () => exports.VERSION;

class LoadProjectHistoryWorkflow extends WorkflowBase {

    static MANIFEST = {
        id:           "LoadProjectHistoryWorkflow.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.2",
        capabilities: ["project:load-history"],
        dependencies: [],
        docs: {
            description: "Loads a project's history.json (chat/action log) from disk, returning an empty history when no project or file is given.",
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

    async run(payload) {
        try {
            const { project } = payload;
            if (!project) {
                return WorkflowResult.ok({ history: [] });
            }

            // FIX v1.0.1: Use paths.root (PROTOAI_ROOT) instead of __dirname-relative path.
            // __dirname/../.. resolves to resources/, not the repo root where data/ lives.
            const historyFile = paths.projects(project, "history.json");

            if (!fs.existsSync(historyFile)) {
                return WorkflowResult.ok({ history: [] });
            }

            const raw = fs.readFileSync(historyFile, "utf8");
            const history = JSON.parse(raw);

            return WorkflowResult.ok({ history });
        } catch (err) {
            return WorkflowResult.error(err);
        }
    }
}

module.exports = LoadProjectHistoryWorkflow;
