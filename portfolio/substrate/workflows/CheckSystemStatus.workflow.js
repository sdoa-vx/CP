// ──────────────────────────────────────────────────────────────────
// File:    CheckSystemStatus.workflow.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure; adjusted require paths
// ──────────────────────────────────────────────────────────────────
// ============================================================
// CheckSystemStatus.workflow.js — Real-time Environment Probe
// ============================================================
"use strict";

const WorkflowBase   = require("./WorkflowBase");
const WorkflowResult = require("./WorkflowResult");
const fs             = require("fs");
const path           = require("path");
const os             = require("os");
const paths          = require("../access/env/paths");

class CheckSystemStatusWorkflow extends WorkflowBase {
    static MANIFEST = {
        id: "CheckSystemStatusWorkflow",
        type: "workflow",
        version: "1.0.0"
    };

    async run() {
        const appdata  = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
        const venvPath = path.join(appdata, "protoai", "ai_env");
        const venvExe  = path.join(venvPath, "Scripts", "python.exe");

        const localAiReady = fs.existsSync(venvExe);

        // Check for common model cache paths
        const hfHome = process.env.HF_HOME || path.join(os.homedir(), ".cache", "huggingface", "hub");
        const modelDir = path.join(hfHome, "models--Qwen--Qwen2.5-Coder-7B-Instruct");
        const modelExists = fs.existsSync(modelDir);

        return WorkflowResult.ok({
            localAiReady: localAiReady && modelExists,
            venvExists: localAiReady,
            modelExists: modelExists,
            modelName: "Qwen2.5-Coder-7B-Instruct",
            os: process.platform,
            arch: process.arch
        });
    }
}

module.exports = CheckSystemStatusWorkflow;
