// ──────────────────────────────────────────────────────────────────
// File:    SysProvisionBun.workflow.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// SysProvisionBunWorkflow.js — Automates Bun installation on Windows
const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const paths = require("../access/env/paths");

class SysProvisionBunWorkflow {

    static MANIFEST = {
        id:           "SysProvisionBunWorkflow.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["provisioning:install-bun"],
        dependencies: [],
        docs: {
            description: "Downloads and installs the Bun runtime for Windows into the app's local bin directory if not already present.",
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
        const binDir = paths.bin();
        if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

        const zipPath = path.join(binDir, "bun-windows.zip");
        const bunExe = path.join(binDir, "bun.exe");

        if (fs.existsSync(bunExe)) {
            return { status: "ok", message: "Bun already installed", path: bunExe };
        }

        // Step 1: Download Bun for Windows
        try {
            console.log("[Provisioning] Downloading Bun for Windows...");
            const url = "https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip";
            await this._downloadFile(url, zipPath);
        } catch (err) {
            return { status: "error", message: `Download failed: ${err.message}` };
        }

        // Step 2: Extract zip
        try {
            console.log("[Provisioning] Extracting Bun...");
            // Use PowerShell to extract zip natively on Windows
            const extractCmd = `powershell Expand-Archive -Path "${zipPath}" -DestinationPath "${binDir}" -Force`;
            execSync(extractCmd);

            // Bun extracts into a subfolder like bun-windows-x64/bun.exe
            // We'll move it to the root of bin/
            const subFolder = path.join(binDir, "bun-windows-x64");
            if (fs.existsSync(path.join(subFolder, "bun.exe"))) {
                fs.renameSync(path.join(subFolder, "bun.exe"), bunExe);
            }

            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

            return { status: "ok", message: "Bun installed successfully", path: bunExe };
        } catch (err) {
            return { status: "error", message: `Extraction failed: ${err.message}` };
        }
    }

    _downloadFile(url, dest) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest);
            https.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Server returned status code ${response.statusCode}`));
                    return;
                }
                response.pipe(file);
                file.on("finish", () => {
                    file.close();
                    resolve();
                });
            }).on("error", (err) => {
                fs.unlink(dest, () => {});
                reject(err);
            });
        });
    }
}

module.exports = SysProvisionBunWorkflow;
