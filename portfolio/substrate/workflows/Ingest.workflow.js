// ──────────────────────────────────────────────────────────────────
// File:    Ingest.workflow.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// IngestWorkflow.js — qmd-based project indexing
// Uses QmdAdapter to index project files into qmd's vector store,
// then optionally runs semantic search to verify indexing.

const paths = require("../access/env/paths");
const QmdAdapter = require("../adapters/QmdAdapter");

class IngestWorkflow {

    static MANIFEST = {
        id:           "Ingest.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["ingest:index-project", "ingest:verify-search"],
        dependencies: ["QmdAdapter.adapter"],
        docs: {
            description: "Indexes a project's files into qmd's vector store via QmdAdapter, with an optional verification search pass after indexing.",
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

    constructor() {
        this.qmd = new QmdAdapter();
    }

    async run(payload = {}) {
        const { project, deep_scan = false } = payload;

        if (!project) {
            return { status: "error", message: "Missing project parameter" };
        }

        const projectDir = paths.projectDir(project);
        const fs = require("fs");

        if (!fs.existsSync(projectDir)) {
            return { status: "error", message: `Project directory not found: ${projectDir}` };
        }

        try {
            // Index the project directory with qmd
            await this.qmd.index(projectDir);

            if (deep_scan) {
                // Force re-embed for deep scans
                await this.qmd._run(["embed", "--force"]);
            }

            // Quick verification search
            const verify = await this.qmd.search("overview");

            return {
                status: "success",
                project,
                collection: project,
                indexed: true,
                deep_scan,
                verification: verify,
                timestamp: Date.now(),
            };
        } catch (err) {
            return {
                status: "error",
                message: err.message,
                project,
                timestamp: Date.now(),
            };
        }
    }

    /**
     * Search indexed project content.
     */
    async search(payload = {}) {
        const { query, project } = payload;
        if (!query) {
            return { status: "error", message: "Missing query parameter" };
        }

        let results;
        if (payload.sql) {
            results = await this.qmd.query(query);
        } else {
            results = await this.qmd.search(query);
        }

        return { status: "success", project, query, results };
    }
}

module.exports = IngestWorkflow;
