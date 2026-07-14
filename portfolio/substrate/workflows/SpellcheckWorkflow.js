// ──────────────────────────────────────────────────────────────────
// File:    SpellcheckWorkflow.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure; adjusted require paths
// ──────────────────────────────────────────────────────────────────
const WorkflowBase = require("./WorkflowBase");
const WorkflowResult = require("./WorkflowResult");
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const paths = require("../access/env/paths");

// SDOA Version
exports.VERSION = "1.0.0";
exports.getVersion = () => exports.VERSION;

class SpellcheckWorkflow extends WorkflowBase {

    static MANIFEST = {
        id:           "SpellcheckWorkflow.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["text:spellcheck"],
        dependencies: [],
        docs: {
            description: "Runs a spellcheck pass over chat text via a spawned external checker, returning corrections for the given engine/profile/project context.",
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
      const { text, engine, profile, project } = payload;

      if (!text || text.trim() === "") {
        return WorkflowResult.error("Spellcheck requires text.");
      }

      const ipcPath = path.resolve(__dirname, "..", "server-ipc.js");
      if (!fs.existsSync(ipcPath)) {
        return WorkflowResult.error("server-ipc.js not found — EngineBridge cannot communicate.");
      }

      const request = {
        type: "spellcheck",
        text,
        engine,
        profile,
        project
      };

      const result = spawnSync("node", [ipcPath], {
        input: JSON.stringify(request),
        encoding: "utf8",
        cwd: paths.root,
        env: { ...process.env, PROTOAI_ROOT: paths.root }
      });

      if (result.error) {
        return WorkflowResult.error(`IPC error: ${result.error.message}`);
      }

      const stdout = result.stdout.trim();
      if (!stdout) {
        return WorkflowResult.error("Engine returned no output.");
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch (err) {
        return WorkflowResult.error(`Invalid JSON from engine: ${stdout}`);
      }

      // expected: { corrected: "...", suggestions: [...] }
      return WorkflowResult.ok(parsed);

    } catch (err) {
      return WorkflowResult.error(err);
    }
  }
}

module.exports = SpellcheckWorkflow;
