// ──────────────────────────────────────────────────────────────────
// File:    VoiceChatWorkflow.js
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

class VoiceChatWorkflow extends WorkflowBase {

    static MANIFEST = {
        id:           "VoiceChat.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["voice:transcript-chat"],
        dependencies: [],
        docs: {
            description: "Runs a voice-originated chat turn: takes a transcript (and optional recorded audio path) and routes it through the standard chat pipeline for a project/profile/engine.",
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
      const { project, profile, engine, transcript, audioPath } = payload;

      if (!transcript && !audioPath) {
        return WorkflowResult.error("VoiceChat requires transcript or audioPath.");
      }

      const ipcPath = path.resolve(__dirname, "..", "server-ipc.js");
      if (!fs.existsSync(ipcPath)) {
        return WorkflowResult.error("server-ipc.js not found — EngineBridge cannot communicate.");
      }

      const request = {
        type: "voice_chat",
        project,
        profile,
        engine,
        transcript,
        audioPath
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

      if (!parsed.reply) {
        return WorkflowResult.error("Engine did not return a reply.");
      }

      return WorkflowResult.ok({
        reply: parsed.reply,
        engine,
        profile,
        project
      });

    } catch (err) {
      return WorkflowResult.error(err);
    }
  }
}

module.exports = VoiceChatWorkflow;
