// ──────────────────────────────────────────────────────────────────
// File:    VfsUpdatePermissions.workflow.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
"use strict";

// ============================================================
// VfsUpdatePermissionsWorkflow.js — Update VFS entry permissions
// version: 1.0.0
// ============================================================

const WorkflowBase    = require("./WorkflowBase");
const WorkflowResult  = require("./WorkflowResult");
const FsVfsRepository = require("../access/fs/FsVfsRepository");

exports.VERSION    = "1.0.0";
exports.getVersion = () => exports.VERSION;

class VfsUpdatePermissionsWorkflow extends WorkflowBase {

    static MANIFEST = {
        id:           "VfsUpdatePermissionsWorkflow.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["vfs:update-permissions"],
        dependencies: ["FsVfsRepository.repository"],
        docs: {
            description: "Updates the read/write/execute permissions stored on a single VFS entry.",
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
            const { project, id, permissions } = payload || {};
            if (!project)     return WorkflowResult.error("Missing 'project'");
            if (!id)          return WorkflowResult.error("Missing 'id'");
            if (!permissions) return WorkflowResult.error("Missing 'permissions'");

            const repo  = new FsVfsRepository(project);
            const entry = repo.getEntry(id);
            if (!entry) return WorkflowResult.error("VFS entry not found: " + id);

            const updated = repo.updatePermissions(id, {
                read:    permissions.read    ?? entry.permissions.read,
                write:   permissions.write   ?? entry.permissions.write,
                execute: permissions.execute ?? entry.permissions.execute,
            });

            return WorkflowResult.ok({
                id,
                permissions: updated.permissions,
                message: "Permissions updated for: " + entry.realPath,
            });
        } catch (err) {
            return WorkflowResult.error(err.message || String(err));
        }
    }
}

module.exports = VfsUpdatePermissionsWorkflow;
