// ──────────────────────────────────────────────────────────────────
// File:    ImportProject.workflow.js
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

class ImportProjectWorkflow extends WorkflowBase {
    static MANIFEST = {
        id:           "ImportProjectWorkflow",
        type:         "service",
        runtime:      "NodeJS",
        version:      "1.0.0",
        capabilities: [],
        dependencies: ["paths"],
        docs: {
            description: "Imports an external project folder by copying it into the projects directory.",
            author: "ProtoAI team",
        }
    };

    async run(payload) {
        try {
            const { sourcePath, projectName } = payload || {};
            if (!sourcePath) return WorkflowResult.error("Missing 'sourcePath'");
            if (!projectName) return WorkflowResult.error("Missing 'projectName'");

            if (!fs.existsSync(sourcePath)) return WorkflowResult.error(`Source path "${sourcePath}" does not exist`);

            const targetDir = paths.projectDir(projectName);
            if (fs.existsSync(targetDir)) return WorkflowResult.error(`Project "${projectName}" already exists`);

            // Copy the folder
            await fs.copy(sourcePath, targetDir);

            // Ensure manifest exists
            const manifestPath = path.join(targetDir, "manifest.json");
            if (!fs.existsSync(manifestPath)) {
                const manifest = {
                    name: projectName,
                    type: "project",
                    version: "1.0.0",
                    createdAt: new Date().toISOString(),
                    importedFrom: sourcePath
                };
                fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
            }

            return WorkflowResult.ok({
                message: `Project "${projectName}" imported successfully`,
                projectPath: targetDir
            });
        } catch (err) {
            return WorkflowResult.error(err.message || String(err));
        }
    }
}

module.exports = ImportProjectWorkflow;
