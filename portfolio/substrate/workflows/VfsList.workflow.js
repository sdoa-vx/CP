// ──────────────────────────────────────────────────────────────────
// File:    VfsList.workflow.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
"use strict";

// ============================================================
// VfsListWorkflow.js — List VFS entries for a project
// version: 1.0.0
// ============================================================

const WorkflowBase     = require("./WorkflowBase");
const WorkflowResult   = require("./WorkflowResult");
const FsVfsRepository  = require("../access/fs/FsVfsRepository");

exports.VERSION    = "1.0.0";
exports.getVersion = () => exports.VERSION;

class VfsListWorkflow extends WorkflowBase {

    static MANIFEST = {
        id:           "VfsListWorkflow.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["vfs:list-entries"],
        dependencies: ["FsVfsRepository.repository"],
        docs: {
            description: "Lists all VFS entries registered for a project.",
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
            const { project, type } = payload || {};
            if (!project) return WorkflowResult.error("Missing 'project'");

            const repo    = new FsVfsRepository(project);
            let   entries = repo.listEntries();

            if (type) entries = entries.filter(e => e.type === type);

            return WorkflowResult.ok({
                project,
                entries,
                count: entries.length,
            });
        } catch (err) {
            return WorkflowResult.error(err.message || String(err));
        }
    }
}

module.exports = VfsListWorkflow;
