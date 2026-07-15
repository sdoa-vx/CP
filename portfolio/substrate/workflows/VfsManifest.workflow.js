// ──────────────────────────────────────────────────────────────────
// File:    VfsManifest.workflow.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
"use strict";

// ============================================================
// VfsManifestWorkflow.js — Get or refresh a VFS manifest
// version: 1.0.0
// ============================================================

const WorkflowBase         = require("./WorkflowBase");
const WorkflowResult       = require("./WorkflowResult");
const FsVfsRepository      = require("../access/fs/FsVfsRepository");
const VfsManifestExtractor = require("../services/VfsManifestExtractor.service");

exports.VERSION    = "1.0.0";
exports.getVersion = () => exports.VERSION;

class VfsManifestWorkflow extends WorkflowBase {

    static MANIFEST = {
        id:           "VfsManifestWorkflow.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["vfs:get-manifest", "vfs:refresh-manifest"],
        dependencies: ["FsVfsRepository.repository", "VfsManifestExtractor.service"],
        docs: {
            description: "Fetches or refreshes the extracted purpose-manifest for a single VFS entry.",
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
            const { project, id, refresh = false } = payload || {};
            if (!project) return WorkflowResult.error("Missing 'project'");
            if (!id)      return WorkflowResult.error("Missing 'id'");

            const repo  = new FsVfsRepository(project);
            const entry = repo.getEntry(id);
            if (!entry) return WorkflowResult.error("VFS entry not found: " + id);

            let manifest = repo.loadManifest(id);

            // Re-extract if missing or refresh requested
            if (!manifest || refresh) {
                manifest    = VfsManifestExtractor.extract(entry.realPath, entry.type);
                manifest.id = id;
                repo.saveManifest(id, manifest);
            }

            return WorkflowResult.ok({ entry, manifest });
        } catch (err) {
            return WorkflowResult.error(err.message || String(err));
        }
    }
}

module.exports = VfsManifestWorkflow;
