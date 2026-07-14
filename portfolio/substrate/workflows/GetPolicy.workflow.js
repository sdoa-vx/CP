// ──────────────────────────────────────────────────────────────────
// File:    GetPolicy.workflow.js
// Version: 4.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");

class GetPolicyWorkflow {
    static MANIFEST = {
        id: "GetPolicy.workflow",
        type: "workflow",
        layer: 3,
        runtime: "NodeJS",
        version: "4.0.1",
        capabilities: ["policy:get"],
        dependencies: ["paths"],
        docs: { description: "Fetches the current LLM policy from policy.defaults.json.", author: "ProtoAI team" },
        last_modified: "2026-07-13T00:00:00Z",
    };

    constructor(deps) {
        this.paths = deps.paths;
    }

    async run(context) {
        try {
            const policyPath = this.paths.data("policy.defaults.json");
            if (!fs.existsSync(policyPath)) {
                return { status: "error", error: "policy.defaults.json not found" };
            }

            const raw = fs.readFileSync(policyPath, "utf8");
            const policy = JSON.parse(raw);

            return { status: "ok", data: policy };
        } catch (err) {
            return { status: "error", error: "Failed to read policy", detail: String(err) };
        }
    }
}

module.exports = GetPolicyWorkflow;
