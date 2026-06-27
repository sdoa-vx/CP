// Last modified: 2026-06-03 04:40 UTC
// ============================================================
// GoogleDrive.adapter.js — SDOA v5 Google Drive Adapter
// layer: 3 (adapter)
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id:       "GoogleDriveAdapter",
        type:     "adapter",
        layer:    3,
        runtime:  "Browser",
        version:  "5.0.0",
        requires: [],
        dataFiles: [],
        lifecycle: ["init"],
        actions: {
            commands: {
                getAuthUrl: { description: "Get the OAuth URL from backend.", input: { clientId: "string" }, output: "object" },
                exchangeCode: { description: "Exchange auth code for tokens.", input: { clientId: "string", clientSecret: "string", code: "string" }, output: "object" },
                listFiles: { description: "List files in user's Google Drive.", input: {}, output: "object" },
                downloadFile: { description: "Download a specific file.", input: { fileId: "string", fileName: "string", project: "string" }, output: "object" }
            }
        },
        backendDeps: ["GoogleDriveWorkflow"],
        docs: {
            description: "Adapter bridging the frontend Google Drive UI components with the GoogleDriveWorkflow backend service.",
            author: "ProtoAI team",
            sdoa: "5.0.0"
        }
    };

    async function init() {
        console.log("[GoogleDriveAdapter] Initialized.");
    }

    async function getAuthUrl(clientId) {
        return await window.backendConnector.runWorkflow("GoogleDriveWorkflow", {
            action: "get_auth_url",
            params: { clientId }
        });
    }

    async function exchangeCode(clientId, clientSecret, code) {
        return await window.backendConnector.runWorkflow("GoogleDriveWorkflow", {
            action: "exchange_code",
            params: { clientId, clientSecret, code }
        });
    }

    async function listFiles() {
        return await window.backendConnector.runWorkflow("GoogleDriveWorkflow", {
            action: "list_files",
            params: {}
        });
    }

    async function downloadFile(fileId, fileName, project) {
        return await window.backendConnector.runWorkflow("GoogleDriveWorkflow", {
            action: "download_file",
            params: { fileId, fileName, project }
        });
    }

    window.GoogleDriveAdapter = {
        MANIFEST,
        init,
        getAuthUrl,
        exchangeCode,
        listFiles,
        downloadFile
    };

    if (window.ModuleLoader) {
        window.ModuleLoader.register(MANIFEST, window.GoogleDriveAdapter);
    }
})();
