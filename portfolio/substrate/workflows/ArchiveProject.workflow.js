// ──────────────────────────────────────────────────────────────────
// File:    ArchiveProject.workflow.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure; adjusted require paths
// ──────────────────────────────────────────────────────────────────
"use strict";

const fs   = require("fs-extra");
const path = require("path");
const WorkflowBase   = require("./WorkflowBase");
const WorkflowResult = require("./WorkflowResult");
const paths          = require("../access/env/paths");

class ArchiveProjectWorkflow extends WorkflowBase {
    static MANIFEST = {
        id:           "ArchiveProjectWorkflow.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["project:archive"],
        dependencies: ["paths"],
        docs: {
            description: "Moves a project directory into data/_archive/, timestamping the destination folder name.",
            author: "ProtoAI team",
        },
        last_modified: "2026-07-13T00:00:00Z",
    };

    async run(payload) {
        try {
            const { project } = payload || {};
            if (!project) return WorkflowResult.error("Missing 'project'");

            const projectDir = paths.projectDir(project);
            if (!fs.existsSync(projectDir)) return WorkflowResult.error(`Project "${project}" does not exist`);

            const archiveRoot = paths.data("_archive");
            if (!fs.existsSync(archiveRoot)) fs.mkdirSync(archiveRoot, { recursive: true });

            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const targetDir = path.join(archiveRoot, `${project}_${timestamp}`);

            await fs.move(projectDir, targetDir);

            return WorkflowResult.ok({
                message: `Project "${project}" archived to _archive/`,
                archivePath: targetDir
            });
        } catch (err) {
            return WorkflowResult.error(err.message || String(err));
        }
    }
}

module.exports = ArchiveProjectWorkflow;
