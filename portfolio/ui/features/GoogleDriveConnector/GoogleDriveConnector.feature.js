// Last modified: 2026-06-03 04:50 UTC
// ============================================================
// GoogleDriveConnector.feature.js — SDOA v5 feature module
// version: 5.0.0 | layer: 1
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id:       "GoogleDriveConnectorFeature",
        type:     "feature",
        layer:    1,
        runtime:  "Browser",
        version:  "5.0.1",
        requires: ["GoogleDriveAdapter", "Modal.prim", "Form.prim", "List.prim", "Toast.prim", "Button.prim"],
        dependencies: ["GoogleDriveAdapter", "Modal.prim", "Form.prim", "List.prim", "Toast.prim", "Button.prim"],
        capabilities: ["googledrive:connectorOpen", "googledrive:credentialsForm", "googledrive:fileBrowser"],
        dataFiles: [],
        lifecycle: ["init"],
        docs: {
            description: "Declarative Google Drive UI connector using standard primitives and adapters.",
            author: "ProtoAI team",
            sdoa: "5.0.0"
        },
        last_modified: "2026-07-13T00:00:00Z"
    };

    let _modal = null;
    let _project = "";
    let _clientId = "";
    let _clientSecret = "";
    let _container = null;

    async function init() {
        // Expose globally to match AppShell's hook
        window.googleDriveConnector = {
            open
        };
        console.log("[GoogleDriveConnectorFeature] Initialized.");
    }

    async function open(project) {
        _project = project;

        // Ensure Modal exists
        if (!_modal) {
            _modal = window.ModalPrim.create({
                title: "Google Drive Connector",
                size: "md",
                onClose: () => {
                    _modal = null;
                    _container = null;
                }
            });
            _container = document.createElement("div");
            _container.style.cssText = "padding: 16px; display: flex; flex-direction: column; gap: 16px; min-height: 250px;";
            _modal._sdoaBody.appendChild(_container);
            window.ModalPrim.open(_modal);
        }

        await _refreshSettings();
        _renderState();
    }

    async function _refreshSettings() {
        const settings = await window.backendConnector.runWorkflow("get_settings");
        _clientId = settings?.googleDrive?.clientId || "";
        _clientSecret = settings?.googleDrive?.clientSecret || "";
    }

    function _renderState() {
        if (!_container) return;
        _container.innerHTML = "";

        if (!_clientId || !_clientSecret) {
            _renderCredentialsForm();
        } else {
            _renderFileBrowser();
        }
    }

    function _renderCredentialsForm() {
        const instruction = document.createElement("p");
        instruction.textContent = "Please provide your Google Cloud Client credentials to connect.";
        instruction.style.cssText = "font-size: 13px; color: var(--text-dim); margin-bottom: 8px;";
        _container.appendChild(instruction);

        const form = window.FormPrim.create({
            fields: [
                { id: "clientId", type: "text", label: "Client ID", placeholder: "Enter client ID..." },
                { id: "clientSecret", type: "password", label: "Client Secret", placeholder: "Enter client secret..." }
            ],
            values: { clientId: _clientId, clientSecret: _clientSecret },
            submitLabel: "Save & Connect",
            onSubmit: async (values) => {
                const cid = values.clientId?.trim();
                const sec = values.clientSecret?.trim();
                if (!cid || !sec) {
                    window.ToastPrim?.show("Client ID and Secret are required", "error");
                    return;
                }

                // Save credentials
                await window.backendConnector.runWorkflow("update_settings", {
                    key: "googleDrive",
                    value: { clientId: cid, clientSecret: sec }
                });

                _clientId = cid;
                _clientSecret = sec;

                // Obtain Auth URL
                const res = await window.GoogleDriveAdapter.getAuthUrl(cid);
                if (res.url) {
                    window.open(res.url, "_blank");
                    _renderCodeVerificationForm();
                } else {
                    window.ToastPrim?.show("Failed to get authorization URL: " + res.error, "error");
                }
            }
        });

        _container.appendChild(form);
    }

    function _renderCodeVerificationForm() {
        _container.innerHTML = "";

        const instruction = document.createElement("p");
        instruction.textContent = "A browser window has opened. Please authenticate and paste the authorization code below:";
        instruction.style.cssText = "font-size: 13px; color: var(--text-dim); margin-bottom: 8px;";
        _container.appendChild(instruction);

        const form = window.FormPrim.create({
            fields: [
                { id: "code", type: "text", label: "Authorization Code", placeholder: "Paste code here..." }
            ],
            values: { code: "" },
            submitLabel: "Verify Code",
            onSubmit: async (values) => {
                const code = values.code?.trim();
                if (!code) {
                    window.ToastPrim?.show("Authorization code is required", "error");
                    return;
                }

                const res = await window.GoogleDriveAdapter.exchangeCode(_clientId, _clientSecret, code);
                if (res.message) {
                    window.ToastPrim?.show("Verification successful!", "success");
                    _renderFileBrowser();
                } else {
                    window.ToastPrim?.show("Verification failed: " + res.error, "error");
                }
            }
        });

        _container.appendChild(form);
    }

    async function _renderFileBrowser() {
        _container.innerHTML = "";

        const loadingText = document.createElement("p");
        loadingText.textContent = "Loading files from Google Drive...";
        loadingText.style.cssText = "font-size: 13px; color: var(--text-dim);";
        _container.appendChild(loadingText);

        const res = await window.GoogleDriveAdapter.listFiles();

        if (res.error === "AUTH_EXPIRED") {
            _clientId = "";
            _clientSecret = "";
            window.ToastPrim?.show("Session expired. Please reconnect.", "warning");
            _renderState();
            return;
        }

        if (!res.files) {
            _container.innerHTML = "";
            const errText = document.createElement("p");
            errText.textContent = `Error loading files: ${res.error || "Unknown error"}`;
            errText.style.cssText = "font-size: 13px; color: var(--color-error);";
            _container.appendChild(errText);
            return;
        }

        _container.innerHTML = "";

        const browserTitle = document.createElement("h3");
        browserTitle.textContent = "Google Drive Files";
        browserTitle.style.cssText = "font-size: 14px; font-weight: 600; margin-bottom: 12px;";
        _container.appendChild(browserTitle);

        const listItems = res.files.map(f => ({
            id: f.id,
            label: f.name,
            icon: f.mimeType === "application/vnd.google-apps.folder" ? "[dir]" : "[file]",
            raw: f
        }));

        const list = window.ListPrim.create({
            items: listItems,
            searchable: true,
            searchKey: "label",
            renderItem: (item, isSelected) => {
                const row = document.createElement("div");
                row.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--border-subtle); cursor: pointer; transition: background 0.2s;";

                const metaWrap = document.createElement("div");
                metaWrap.style.cssText = "display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;";

                const iconSpan = document.createElement("span");
                iconSpan.textContent = item.icon;
                metaWrap.appendChild(iconSpan);

                const labelSpan = document.createElement("span");
                labelSpan.textContent = item.label;
                labelSpan.style.cssText = "overflow: hidden; text-overflow: ellipsis;";
                metaWrap.appendChild(labelSpan);

                row.appendChild(metaWrap);

                if (item.raw.mimeType !== "application/vnd.google-apps.folder") {
                    const importBtn = window.ButtonPrim.create({
                        label: "Import",
                        variant: "ghost",
                        onClick: async (e) => {
                            e.stopPropagation();
                            importBtn.disabled = true;
                            importBtn._sdoaUpdate?.({ label: "[...]", disabled: true });

                            try {
                                const dl = await window.GoogleDriveAdapter.downloadFile(item.id, item.label, _project);
                                if (dl.message) {
                                    importBtn._sdoaUpdate?.({ label: "[done]", disabled: true });
                                    window.ToastPrim?.show(`Imported ${item.label}`, "success");
                                    // Trigger file list refresh if globally available
                                    if (window.FileExplorerFeature) {
                                        window.FileExplorerFeature.refresh?.();
                                    }
                                } else {
                                    importBtn._sdoaUpdate?.({ label: "[err]", disabled: false });
                                    window.ToastPrim?.show("Download failed: " + dl.error, "error");
                                }
                            } catch (err) {
                                importBtn._sdoaUpdate?.({ label: "[err]", disabled: false });
                                window.ToastPrim?.show("Download failed: " + err.message, "error");
                            }
                        }
                    });
                    row.appendChild(importBtn);
                }

                return row;
            }
        });

        _container.appendChild(list);
    }

    const feature = { MANIFEST, init, open };
    window.GoogleDriveConnectorFeature = feature;

    if (window.ModuleLoader) {
        window.ModuleLoader.register(MANIFEST, feature);
    }
})();
