// ──────────────────────────────────────────────────────────────────
// File:    ResponseFormatter.service.js
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure; 6.9 version used (newer: 2026-06-08)
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-08 16:17 UTC
"use strict";

class ResponseFormatter {
    static MANIFEST = {
        id: "ResponseFormatter.service",
        type: "service",
        layer: 3,
        runtime: "NodeJS",
        version: "5.0.1",
        last_modified: "2026-07-13T00:00:00Z",
        requires: [],
        dependencies: [],
        capabilities: ["response:ok", "response:fail", "response:safe-json-parse", "response:write-response", "response:write-error", "response:write-success", "response:write-event"],
        lifecycle: [],
        docs: {
            description: "Standardized response formatter for SDOA v5.",
            author: "ProtoAI team",
            sdoa: "5.0.0"
        }
    };

    /**
     * Format and return a success response
     * @param {any} data The payload data
     */
    static ok(data) {
        return { ok: true, data };
    }
    ok(data) {
        return ResponseFormatter.ok(data);
    }

    /**
     * Format and return an error response
     * @param {string} error Error summary
     * @param {string} [detail] Optional error stack or detail
     */
    static fail(error, detail = null) {
        return { ok: false, error, detail };
    }
    fail(error, detail = null) {
        return ResponseFormatter.fail(error, detail);
    }

    /**
     * Safely parse an incoming JSON line
     * @param {string} str
     * @returns {{ok: boolean, value?: any, error?: any}}
     */
    static safeJsonParse(str) {
        try {
            return { ok: true, value: JSON.parse(str) };
        } catch (err) {
            return { ok: false, error: err };
        }
    }
    safeJsonParse(str) {
        return ResponseFormatter.safeJsonParse(str);
    }

    /**
     * Write a JSON-lines response to the Tauri frontend via stdout
     * @param {Object} obj The response object
     */
    static writeResponse(obj) {
        if (obj === null || obj === undefined) return; // Never write null to stdout
        try {
            process.stdout.write(JSON.stringify(obj) + "\n");
        } catch (err) {
            process.stderr.write("[ResponseFormatter] ❌ Failed to serialize IPC response: " + err.message + "\n");
        }
    }
    writeResponse(obj) {
        ResponseFormatter.writeResponse(obj);
    }

    /**
     * Format and write an error response
     * @param {string} id The request ID
     * @param {string} error Error summary
     * @param {string} [detail] Optional error stack or detail
     */
    static writeError(id, error, detail = null) {
        this.writeResponse({ id, ok: false, error, detail });
    }
    writeError(id, error, detail = null) {
        ResponseFormatter.writeError(id, error, detail);
    }

    /**
     * Format and write a success response
     * @param {string} id The request ID
     * @param {any} data The payload data
     */
    static writeSuccess(id, data) {
        this.writeResponse({ id, ok: true, data });
    }
    writeSuccess(id, data) {
        ResponseFormatter.writeSuccess(id, data);
    }

    /**
     * Format and write an event stream
     * @param {string} id The request ID
     * @param {string} eventName The name of the event to emit
     * @param {any} data The payload data
     */
    static writeEvent(id, eventName, data) {
        this.writeResponse({ id, ok: true, type: "event", event_name: eventName, data });
    }
    writeEvent(id, eventName, data) {
        ResponseFormatter.writeEvent(id, eventName, data);
    }
}

module.exports = ResponseFormatter;
