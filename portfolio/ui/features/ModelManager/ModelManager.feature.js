// ============================================================
// Last modified: 2026-05-04 03:11 UTC
// ModelManager.feature.js — SDOA v4 Feature | v4.0.0 | layer 1
// Replaces ModelManager.ui.js. Manages AI models & archetypes.
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "ModelManager.feature", type: "feature", layer: 1,
        runtime: "Browser", version: "4.0.1",
        requires: ["Modal.prim", "TabGroup.prim", "Form.prim", "Button.prim", "Toast.prim"],
        dependencies: ["Modal.prim", "TabGroup.prim", "Form.prim", "Button.prim", "Toast.prim"],
        capabilities: ["modelmanager:open", "modelmanager:activateArchetype", "modelmanager:getActiveModels"],
        dataFiles: [],
        lifecycle: ["init"],
        actions: { commands: { open: {}, activateArchetype: {}, getActiveModels: {} }, events: { archetypeActivated: {}, inventoryReordered: {}, policyUpdated: {} }, accepts: {}, slots: {} },
        backendDeps: ["get_model_inventory", "save_model_inventory"],
        docs: { description: "Model inventory manager and archetype profile system.", author: "ProtoAI team", sdoa: "4.0.0" },
        last_modified: "2026-07-13T00:00:00Z"
    };

    // ── CATEGORIES & DEFAULTS ────────────────────────────────
    const CATEGORIES = [
        { id: "chat",         label: "💬 Chat",         color: "#60a5fa" },
        { id: "coding",       label: "💻 Coding",       color: "#34d399" },
        { id: "research",     label: "🔎 Research",     color: "#a78bfa" },
        { id: "reasoning",    label: "🧠 Reasoning",    color: "#f59e0b" },
        { id: "image",        label: "🖼 Image",        color: "#f472b6" },
        { id: "video",        label: "🎬 Video",        color: "#fb923c" },
        { id: "audio",        label: "🎵 Audio",        color: "#38bdf8" },
        { id: "music",        label: "🎼 Music",        color: "#c084fc" },
        { id: "experimental", label: "🧪 Experimental", color: "#6ee7b7" },
        { id: "assistant",    label: "🤖 Assistant",    color: "#94a3b8" },
        { id: "router",       label: "🔀 Router",       color: "#71717a" },
    ];
    const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

    let _models = [];
    let _archetypes = [];
    let _activeArchetype = null;
    let _modal = null;
    let _editModal = null;
    let _draggedIndex = null;

    async function init() {
        // Expose to window for backwards compat with anything still calling window.modelManager
        window.modelManager = { activateArchetype, getActiveModels };

        // Add open button logic to toolbar or settings area
        const btn = document.getElementById("openModelsButton");
        if (btn) btn.addEventListener("click", open);
    }

    async function open() {
        await _loadState();

        _modal = window.ModalPrim.create({
            title: "Model Manager",
            size: "xl",
            onClose: () => { _modal = null; }
        });

        _modal._sdoaBody.style.padding = "0";

        // Build TabGroup
        const tabsData = [
            { id: "browse",     label: "🔎 Browse Models" },
            { id: "archetypes", label: "🎭 Archetypes" },
            { id: "build",      label: "🛠 Build Custom" }
        ];

        const tabs = window.TabGroupPrim.create({
            variant: "horizontal",
            tabs: tabsData,
            renderTab: (tabId, container) => {
                container.classList.add("mm-root");
                const content = document.createElement("div");
                content.className = "mm-content";

                if (tabId === "browse") {
                    _renderBrowseModels(content);
                } else if (tabId === "archetypes") {
                    _renderArchetypes(content);
                } else if (tabId === "build") {
                    _renderBuildArchetype(content);
                }

                container.appendChild(content);
            }
        });

        _modal._sdoaBody.appendChild(tabs);
        window.ModalPrim.open(_modal);
    }

    function _renderBrowseModels(content) {
        content.innerHTML = `
            <div class="mm-inventory-header">
                <span style="font-size:14px;font-weight:600;color:var(--text-bright);">Global Model Inventory</span>
                <span style="font-size:12px;color:var(--text-dim);margin-left:8px;">
                    ${_models.filter(m => m.active).length} / ${_models.length} active
                </span>
                <div id="mmAddModelContainer" style="margin-left:auto;"></div>
            </div>
            <div class="mm-table" id="mmTable">
                ${_models.length === 0 ? `<div style="padding:20px;color:var(--text-dim);font-size:13px;">No models in inventory. Add one above.</div>` : ""}
            </div>
        `;

        const addBtnContainer = content.querySelector("#mmAddModelContainer");
        const addBtn = window.ButtonPrim.create({ label: "+ Add Model", variant: "secondary", size: "sm", onClick: () => _addModelPrompt(content) });
        addBtnContainer.appendChild(addBtn);

        const table = content.querySelector("#mmTable");

        _models.forEach((model, globalIndex) => {
            const row = document.createElement("div");
            row.className = "mm-model-row";

            row.innerHTML = `
                <div class="mm-row-toggle-container"></div>
                <span class="mm-model-name ${model.active ? "" : "mm-inactive"}">
                    ${model.name}
                </span>
                <span class="mm-api-badge">${model.api}</span>
                <button class="mm-edit-btn icon-btn" title="Delete" style="color:var(--color-danger);margin-left:auto;">🗑</button>
            `;

            const toggleContainer = row.querySelector(".mm-row-toggle-container");
            const toggle = window.TogglePrim.create({
                checked: model.active,
                onChange: (checked) => {
                    _models[globalIndex].active = checked;
                    row.querySelector(".mm-model-name").classList.toggle("mm-inactive", !checked);
                    _saveState();
                }
            });
            toggleContainer.appendChild(toggle);

            row.querySelector(".mm-edit-btn").addEventListener("click", () => {
                if (confirm(`Delete ${model.name}?`)) {
                    _models.splice(globalIndex, 1);
                    _saveState();
                    _renderBrowseModels(content);
                }
            });

            table.appendChild(row);
        });
    }

    function _addModelPrompt(content) {
        if (content.querySelector(".mm-add-form")) return;

        const form = document.createElement("div");
        form.className = "mm-add-form";

        const sdoaForm = window.FormPrim.create({
            fields: [
                { id: "name", type: "text", placeholder: "provider/model-name" },
                { id: "api", type: "select", options: ["openrouter", "anthropic", "openai", "local"] }
            ],
            submitLabel: "Add",
            onSubmit: (vals) => {
                if (!vals.name) return;
                const id = vals.name.replace(/[^a-z0-9]/gi, "-").toLowerCase() + "-" + Date.now();
                _models.push({ id, name: vals.name, api: vals.api || "openrouter", category: "uncategorized", active: true });
                _saveState();
                _renderBrowseModels(content);
            }
        });

        sdoaForm.style.display = "flex";
        sdoaForm.style.flexDirection = "row";
        sdoaForm.style.gap = "8px";
        sdoaForm.style.alignItems = "center";

        form.appendChild(sdoaForm);
        const cancelBtn = window.ButtonPrim.create({ label: "Cancel", variant: "secondary", onClick: () => form.remove() });
        form.appendChild(cancelBtn);

        content.querySelector("#mmTable").before(form);
    }

    function _renderArchetypes(content) {
        content.innerHTML = `
            <div class="mm-archetype-header">
                <p style="font-size:12px;color:var(--text-dim);margin:0 0 12px;">
                    Select an archetype to activate its persona and model routing preferences.
                </p>
            </div>
            <div class="mm-archetype-grid" id="mmArchetypeGrid"></div>
        `;

        const grid = content.querySelector("#mmArchetypeGrid");

        if (_archetypes.length === 0) {
            grid.innerHTML = `<div style="padding:20px;color:var(--text-dim);grid-column:1/-1;">No archetypes found. Create one in the "Build Custom" tab.</div>`;
        }

        _archetypes.forEach((arch, index) => {
            const isActive = _activeArchetype === arch.id;
            const card = document.createElement("div");
            card.className = `mm-archetype-card ${isActive ? "active" : ""}`;
            card.style.position = "relative";

            const primaryPreview = (arch.primaryModels || []).slice(0, 3)
                .map(m => `<span class="mm-model-chip">${m.split("/").pop()}</span>`).join("");

            card.innerHTML = `
                <div style="position:absolute;top:8px;right:8px;display:flex;gap:4px;">
                    <button class="mm-edit-arch-btn icon-btn" title="Delete" style="font-size:12px;color:var(--color-danger);">🗑</button>
                </div>
                <div class="mm-card-emoji">${arch.emoji || "🤖"}</div>
                <div class="mm-card-name">${arch.name}</div>
                <div class="mm-card-desc">${arch.description || "No description"}</div>
                <div class="mm-card-desc" style="font-size:11px;color:var(--text-dim);margin-top:4px;">
                    <strong>Best For:</strong> ${arch.bestFor || "General"}
                </div>
                <div class="mm-card-voice" style="font-size:11px;color:var(--text-dim);margin:4px 0 8px;font-style:italic;">
                    ${arch.voice || "Standard"}
                </div>
                <div class="mm-card-models">${primaryPreview}</div>
                ${isActive ? `<div class="mm-card-active-badge">✓ Active</div>` : `<div class="mm-card-activate-btn-container"></div>`}
            `;

            if (!isActive) {
                const btnContainer = card.querySelector(".mm-card-activate-btn-container");
                const activateBtn = window.ButtonPrim.create({
                    label: "Activate",
                    variant: "secondary",
                    size: "sm",
                    onClick: async (e) => {
                        e.stopPropagation();
                        await activateArchetype(arch.id);
                        _renderArchetypes(content);
                    }
                });
                activateBtn.style.marginTop = "8px";
                activateBtn.style.width = "100%";
                btnContainer.appendChild(activateBtn);
            }

            card.querySelector(".mm-edit-arch-btn").addEventListener("click", (e) => {
                e.stopPropagation();
                if (confirm(`Delete archetype "${arch.name}"?`)) {
                    _archetypes.splice(index, 1);
                    if (_activeArchetype === arch.id) _activeArchetype = null;
                    _saveState();
                    _renderArchetypes(content);
                }
            });

            grid.appendChild(card);
        });
    }

    function _renderBuildArchetype(content) {
        content.innerHTML = `
            <div style="max-width:600px; margin:0 auto; padding:20px;">
                <h3 style="margin-top:0; color:var(--text-bright);">Create New Archetype</h3>
                <p style="font-size:12px; color:var(--text-dim); margin-bottom:20px;">
                    Archetypes bundle a persona instruction and preferred models together.
                </p>
                <div id="buildArchForm"></div>
            </div>
        `;

        const activeModelOptions = _models.filter(m => m.active).map(m => ({ value: m.name, label: m.name }));

        const form = window.FormPrim.create({
            fields: [
                { id: "name", type: "text", label: "Archetype Name", placeholder: "e.g. Master Coder" },
                { id: "emoji", type: "text", label: "Emoji Icon", placeholder: "💻" },
                { id: "description", type: "text", label: "Description", placeholder: "Short summary..." },
                { id: "bestFor", type: "text", label: "Best For", placeholder: "e.g. Complex logic, Refactoring" },
                { id: "voice", type: "textarea", label: "Persona / Voice Instruction", placeholder: "You are a senior engineer...", rows: 3 },
                { id: "primaryModels", type: "select", label: "Primary Model Assignment", options: activeModelOptions, hint: "Will support multi-select in future" }
            ],
            submitLabel: "Save Archetype",
            onSubmit: (vals) => {
                if (!vals.name) return window.ToastPrim.show("Name required", "error");

                const id = vals.name.replace(/[^a-z0-9]/gi, "-").toLowerCase() + "-" + Date.now();
                _archetypes.push({
                    id,
                    name: vals.name,
                    emoji: vals.emoji || "🤖",
                    description: vals.description || "",
                    bestFor: vals.bestFor || "General",
                    voice: vals.voice || "Helpful assistant",
                    primaryModels: vals.primaryModels ? [vals.primaryModels] : []
                });

                _saveState();
                window.ToastPrim.show("Archetype created!", "success");

                // Switch back to archetypes tab
                const tabGroup = _modal._sdoaBody.querySelector(".sdoa-tabs");
                if (tabGroup && tabGroup.__selectTab) {
                    tabGroup.__selectTab("archetypes");
                } else {
                    open(); // reload
                }
            }
        });

        content.querySelector("#buildArchForm").appendChild(form);
    }


    async function activateArchetype(id) {
        const arch = _archetypes.find(a => a.id === id);
        if (!arch) return;

        _activeArchetype = id;

        // Persist to catalog
        await _saveState();

        // Emit event for policy engine / chat to pick up
        window.dispatchEvent(new CustomEvent("archetype:activated", { detail: { id, arch } }));
        window.ToastPrim?.show(`Archetype "${arch.name}" activated`, "success");
    }

    function getActiveModels() {
        if (_activeArchetype) {
            const arch = _archetypes.find(a => a.id === _activeArchetype);
            if (arch) return arch.primaryModels || [];
        }
        return _models.filter(m => m.active).map(m => m.name);
    }

    async function _loadState() {
        try {
            const res = await window.backendConnector?.runWorkflow("get_model_inventory");
            if (res?.ok && res.data) {
                _models         = res.data.models      || [];
                _archetypes     = res.data.archetypes  || [];
                _activeArchetype = res.data.activeArchetype || null;
            } else {
                _models = []; _archetypes = []; _activeArchetype = null;
            }
        } catch (err) {
            console.warn("[ModelManager] _loadState failed:", err);
            _models = []; _archetypes = []; _activeArchetype = null;
        }
    }

    async function _saveState() {
        try {
            await window.backendConnector?.runWorkflow("save_model_inventory", {
                models:          _models,
                archetypes:      _archetypes,
                activeArchetype: _activeArchetype
            });
        } catch (err) {
            console.warn("[ModelManager] _saveState failed:", err);
            window.ToastPrim?.show("Failed to save model state", "error");
        }
    }

    // ── Module Registration ──────────────────────────────────────
    window.ModuleLoader?.register(MANIFEST, { init });

    // Expose feature API globally
    window.ModelManagerFeature = { open, activateArchetype, getActiveModels };

})();
