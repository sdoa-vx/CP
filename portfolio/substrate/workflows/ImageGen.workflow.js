// ──────────────────────────────────────────────────────────────────
// File:    ImageGen.workflow.js
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// ImageGenWorkflow — generates a real image URL via Pollinations.ai
// Uses user's text directly as prompt (no secondary LLM call)
const path = require("path");
const fs = require("fs-extra");
const paths = require("../access/env/paths");
const WorkflowResult = require("./WorkflowResult");

class ImageGenWorkflow {

    static MANIFEST = {
        id:           "ImageGenWorkflow.workflow",
        type:         "workflow",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.1",
        capabilities: ["image:generate"],
        dependencies: [],
        docs: {
            description: "Generates an image URL from free-text via the Pollinations.ai API, using the user's description directly as the prompt without a secondary LLM rewrite.",
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

    async run(context) {
        const { text, project } = context || {};
        if (!text?.trim()) {
            return new WorkflowResult("error", { error: "No image description provided" });
        }

        const prompt = text.trim();
        const seed = Math.floor(Math.random() * 999999);
        const encoded = encodeURIComponent(prompt);
        const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=768&seed=${seed}&nologo=true`;

        // Save metadata to project dir if available
        if (project) {
            try {
                const projectDir = paths.projectDir(project);
                fs.mkdirSync(projectDir, { recursive: true });
                fs.writeFileSync(
                    path.join(projectDir, `image_${seed}.meta.json`),
                    JSON.stringify({ prompt, url: imageUrl, seed, created: new Date().toISOString() }, null, 2),
                    "utf8"
                );
            } catch (e) { /* best-effort */ }
        }

        return new WorkflowResult("ok", {
            url: imageUrl,
            prompt,
            seed,
            html: `<img src="${imageUrl}" alt="${prompt.replace(/"/g, '&quot;')}" style="max-width:100%;border-radius:8px;margin-top:8px;box-shadow:0 4px 20px rgba(0,0,0,0.4);"/>`
        });
    }
}

module.exports = ImageGenWorkflow;
