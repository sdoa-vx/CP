// ──────────────────────────────────────────────────────────────────
// File:    SpawnShell.workflow.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
const { spawn } = require("child_process");
const WorkflowResult = require("./WorkflowResult");

class SpawnShellWorkflow {

    static MANIFEST = {
        id:           "SpawnShellWorkflow.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["shell:spawn-interactive"],
        dependencies: [],
        docs: {
            description: "Spawns an interactive OS shell (PowerShell or cmd on Windows) as a child process for terminal-style workflows.",
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

    constructor() {}

    async run(context) {
        const { shell = "powershell" } = context || {};

        let shellCmd, shellArgs;
        const isWindows = process.platform === "win32";

        if (isWindows) {
            if (shell === "cmd") {
                shellCmd = "cmd.exe";
                shellArgs = [];
            } else if (shell === "powershell") {
                shellCmd = "powershell.exe";
                shellArgs = ["-NoExit"];
            } else {
                // Default to PowerShell
                shellCmd = "powershell.exe";
                shellArgs = ["-NoExit"];
            }
        } else {
            // Unix-like systems
            shellCmd = "/bin/bash";
            shellArgs = ["-i"];
        }

        try {
            const child = spawn(shellCmd, shellArgs, {
                cwd: process.cwd(),
                env: { ...process.env, TERM: "xterm-256color" },
                shell: true,
                stdio: ["pipe", "pipe", "pipe"],
            });

            // Store the process for later interaction
            const pid = child.pid;

            // Clean up on exit
            child.on("close", () => {
                console.log(`[SpawnShellWorkflow] Shell process ${pid} exited`);
            });

            child.on("error", (err) => {
                console.error(`[SpawnShellWorkflow] Error spawning shell:`, err);
            });

            return new WorkflowResult("ok", {
                pid,
                shell: shellCmd,
                message: `Spawned ${shell} with PID ${pid}`,
            });
        } catch (err) {
            return new WorkflowResult("error", {
                error: "Failed to spawn shell",
                detail: String(err),
            });
        }
    }
}

module.exports = SpawnShellWorkflow;
