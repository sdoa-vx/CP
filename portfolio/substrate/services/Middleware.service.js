// ──────────────────────────────────────────────────────────────────
// File:    Middleware.service.js
// Version: 1.1.0
// Updated: 2026-06-27T00:00:00Z
// Changes: V8 compliance — added MANIFEST block for registry
//          discoverability. Version bumped 1.0.0 → 1.1.0.
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-27
"use strict";

const fs = require("fs");

class Middleware {
    static MANIFEST = {
        id:              "Middleware.service",
        type:            "service",
        layer:           3,
        runtime:         "NodeJS",
        version:         "1.1.0",
        operationalRole: "savant",
        requires:        [],
        capabilities:    ["logging", "log-rotation"],
        lifecycle:       ["init"],
        actions: {
            commands: {
                initLogging: {
                    description: "Initialise file logging with optional rotation.",
                    input:  { logFile: "string" },
                    output: "void"
                },
                log: {
                    description: "Write a log line to stderr and, if initialised, the log file.",
                    input:  { args: "any[]" },
                    output: "void"
                }
            },
            events:  {},
            accepts: {},
            slots:   {}
        },
        optimization: { priority: "readability", assertionSuite: "" },
        docs: {
            description: "Safe IPC-aware logging service. Writes to stderr (not stdout) to avoid polluting the IPC stream. Supports automatic log rotation at 10 MB.",
            author: "ProtoAI team",
            sdoa:   "5.0.0"
        }
    };

    static _logFile = null;
    static _logWriteCount = 0;

    /**
     * Initialize logging. Safe to call before logFile is set.
     * @param {string} logFile Path to the log file.
     */
    static initLogging(logFile) {
        this._logFile = logFile;
        if (this._logFile) {
            this._checkRotation();
            try {
                fs.appendFileSync(this._logFile, `\n--- IPC server started at ${new Date().toISOString()} ---\n`);
            } catch (err) {
                // If it fails, we fall back to stderr
                process.stderr.write(`[Middleware] Warning: could not open log file: ${err.message}\n`);
                this._logFile = null;
            }
        }
    }

    /**
     * Check size of the log file and rotate it to .bak if it exceeds 10MB.
     */
    static _checkRotation() {
        if (!this._logFile) return;
        try {
            if (fs.existsSync(this._logFile)) {
                const stats = fs.statSync(this._logFile);
                if (stats.size > 10 * 1024 * 1024) { // 10MB
                    let index = 1;
                    let bak = this._logFile + ".bak" + index;
                    while (fs.existsSync(bak)) {
                        index++;
                        bak = this._logFile + ".bak" + index;
                    }
                    fs.renameSync(this._logFile, bak);
                    fs.appendFileSync(this._logFile, `\n--- Log rotated at ${new Date().toISOString()} ---\n`);
                }
            }
        } catch (err) {
            process.stderr.write(`[Middleware] Error rotating log: ${err.message}\n`);
        }
    }

    /**
     * Safe logging. Writes to stderr so it doesn't pollute stdout (which is the IPC stream).
     * @param  {...any} args
     */
    static log(...args) {
        const line = args.map(a =>
            a instanceof Error ? `${a.message}\n${a.stack}` :
            typeof a === "string" ? a :
            JSON.stringify(a)
        ).join(" ");

        process.stderr.write(line + "\n");

        if (this._logFile) {
            try {
                fs.appendFileSync(this._logFile, line + "\n");
                this._logWriteCount++;
                if (this._logWriteCount >= 100) {
                    this._logWriteCount = 0;
                    this._checkRotation();
                }
            } catch { /* log file not writable */ }
        }
    }
}

module.exports = Middleware;
