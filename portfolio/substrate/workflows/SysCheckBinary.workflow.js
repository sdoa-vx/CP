// ──────────────────────────────────────────────────────────────────
// File:    SysCheckBinary.workflow.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// SysCheckBinaryWorkflow.js — Checks if a binary is available on the system PATH or in app bin
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const paths = require("../access/env/paths");

class SysCheckBinaryWorkflow {

    static MANIFEST = {
        id:           "SysCheckBinaryWorkflow.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["system:check-binary"],
        dependencies: [],
        docs: {
            description: "Checks whether a named binary is available in the app's local bin directory or on the system PATH.",
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

    async run(payload = {}) {
        const { bin } = payload;
        if (!bin) return { status: "error", message: "Missing binary name" };

        // 1. Check local bin directory first
        const localBin = path.join(paths.bin(), bin.endsWith(".exe") ? bin : `${bin}.exe`);
        if (fs.existsSync(localBin)) {
            return { status: "ok", found: true, path: localBin };
        }

        // 2. Check system PATH
        try {
            const cmd = process.platform === "win32" ? `where ${bin}` : `which ${bin}`;
            const foundPath = execSync(cmd, { stdio: "pipe" }).toString().trim().split("\n")[0];
            return { status: "ok", found: true, path: foundPath };
        } catch (_) {
            return { status: "ok", found: false };
        }
    }
}

module.exports = SysCheckBinaryWorkflow;
