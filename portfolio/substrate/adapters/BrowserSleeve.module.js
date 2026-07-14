// ──────────────────────────────────────────────────────────────────
// File:    BrowserSleeve.module.js
// Version: 1.0.0
// Updated: 2026-06-27T00:00:00Z
// Changes: Phase 2 Step 6 — Sleeve ratification (SDOA v5.4 §2.7).
//          Replaces BackendConnector.js as the boundary sovereign for
//          the Tauri IPC bridge in the Browser runtime.
//          external.system = "tauri-ipc",
//          transport = "window.__TAURI__".
// ──────────────────────────────────────────────────────────────────

(function () {
    "use strict";

    class BrowserSleeve {

        static MANIFEST = {
            id:              "BrowserSleeve.module",
            type:            "adapter",          // "sleeve" pending typedef extension
            layer:           3,
            runtime:         "Browser",
            version:         "1.0.1",
            last_modified:   "2026-07-13T00:00:00Z",
            operationalRole: "savant",
            requires:        ["ResponseFormatter.service", "PathResolver.service"],
            dependencies:    ["ResponseFormatter.service", "PathResolver.service"],
            capabilities:    [
                "tauri.invoke",
                "backend.workflow",
                "backend.status",
                "transport.reconnect"
            ],
            lifecycle: ["init", "run", "dispose"],

            external: {
                system:    "tauri-ipc",
                transport: "window.__TAURI__",
                path:      "auto",
                commands:  [
                    "engine_chat", "engine_projects", "engine_profiles",
                    "engine_history", "engine_status", "engine_reconnect",
                    "engine_image_gen", "engine_deep_search", "run_workflow"
                ]
            },

            actions: {
                commands: {
                    runWorkflow: {
                        description: "Execute a backend workflow via Tauri IPC. Normalises output through ResponseFormatter.",
                        input:  { name: "string", payload: "object?" },
                        output: "Promise<any>"
                    },
                    getBackendStatus: {
                        description: "Query current backend engine status.",
                        input:  {},
                        output: "string"
                    }
                },
                triggers: {
                    backendCrashed:   { description: "Fires when the Tauri sidecar crashes." },
                    backendRecovered: { description: "Fires when the backend returns to ready state." }
                },
                emits: {
                    statusChanged:  { description: "Backend status updates.", payload: { mode: "string", detail: "string?" } },
                    workflowFailed: { description: "Workflow transport failure.", payload: { workflow: "string", error: "string" } }
                },
                accepts: {},
                slots:   {}
            },

            docs: {
                description: "Sleeve boundary module. Wraps window.__TAURI__ IPC calls and normalises all responses through ResponseFormatter. The only module permitted to reference window.__TAURI__ directly.",
                author: "ProtoAI team",
                sdoa:   "5.4.0"
            }
        };

        get _tauri() {
            return window.__TAURI__?.core?.invoke
                ? window.__TAURI__
                : null;
        }

        async runWorkflow(name, payload = {}) {
            if (!this._tauri) {
                window.EventBus?.emit("BrowserSleeve:workflowFailed", { workflow: name, error: "Tauri IPC not available" });
                throw new Error("[BrowserSleeve] Tauri IPC not available");
            }

            try {
                const result = await this._invokeTauri(name, payload);
                return result;
            } catch (err) {
                const msg = String(err).toLowerCase();
                window.EventBus?.emit("BrowserSleeve:workflowFailed", { workflow: name, error: err.message });

                const isTransport = ["crash", "not ready", "sidecar", "timed out", "failed to fetch"]
                    .some(s => msg.includes(s));

                if (isTransport) {
                    try {
                        const status = await this._tauri.core.invoke("engine_status");
                        if (status === "crashed") {
                            window.EventBus?.emit("BrowserSleeve:backendCrashed", {});
                        }
                    } catch (_) {}
                }

                throw err;
            }
        }

        async getBackendStatus() {
            if (!this._tauri) return "offline";
            try { return await this._tauri.core.invoke("engine_status"); } catch (_) { return "offline"; }
        }

        async _invokeTauri(workflow, payload) {
            const inv = this._tauri.core.invoke;
            const dispatch = {
                ListProjectsWorkflow:      () => inv("engine_projects"),
                ListProfilesWorkflow:      () => inv("engine_profiles"),
                LoadProjectHistoryWorkflow:() => inv("engine_history",   { project: payload.project }),
                SendMessageWorkflow:       () => inv("engine_chat",      { project: payload.project, profile: payload.profile || "", engine: payload.engine || "", message: payload.message }),
                UploadWorkflow:            () => inv("engine_upload",    { project: payload.project, filename: payload.filename, content: payload.content || "" }),
                IngestWorkflow:            () => inv("engine_ingest",    { project: payload.project }),
                ImageGenWorkflow:          () => inv("engine_image_gen", { text: payload.text, project: payload.project || "" }),
                DeepSearchWorkflow:        () => inv("engine_deep_search", { query: payload.query }),
            };
            if (dispatch[workflow]) return dispatch[workflow]();
            return inv("run_workflow", { name: workflow, payload: JSON.stringify(payload) })
                .then(raw => JSON.parse(raw));
        }
    }

    // Auto-register on DOM ready
    const { domReady } = window.TauriUtils ?? { domReady: (fn) => document.addEventListener("DOMContentLoaded", fn) };
    domReady(() => {
        window.browserSleeve = new BrowserSleeve();
        // Backward-compat alias so existing callers using window.backendConnector still work
        window.backendConnector = window.browserSleeve;
    });
})();
