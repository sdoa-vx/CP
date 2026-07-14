// ──────────────────────────────────────────────────────────────────
// File:    SaveModelInventory.workflow.js
// Version: 4.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");

class SaveModelInventoryWorkflow {
    static MANIFEST = {
        id: "SaveModelInventory.workflow",
        type: "workflow",
        layer: 3,
        runtime: "NodeJS",
        version: "4.0.1",
        capabilities: ["models:save-inventory"],
        dependencies: ["paths"],
        docs: { description: "Saves updates to the model inventory in models.catalog.json.", author: "ProtoAI team" },
        last_modified: "2026-07-13T00:00:00Z",
    };

    constructor(deps) {
        this.paths = deps.paths;
    }

    async run(context) {
        try {
            const { models, activeArchetype, archetypes } = context;
            const catalogPath = this.paths.data("models.catalog.json");

            let catalog = {};
            if (fs.existsSync(catalogPath)) {
                catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
            }

            if (models) catalog.models = models;
            if (activeArchetype) catalog.activeArchetype = activeArchetype;
            if (archetypes) catalog.archetypes = archetypes;

            fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), "utf8");

            return { status: "ok", data: catalog };
        } catch (err) {
            return { status: "error", error: "Failed to save model inventory", detail: String(err) };
        }
    }
}

module.exports = SaveModelInventoryWorkflow;
