// ============================================================
// AppShellProjectPanel.component.js — SDOA v5 Component | layer 1
// Updated: 2026-07-14
// Extracted from AppShell.feature.js (Phase 5 — oversized-file split).
// Carries the project list (load/select/rename/duplicate/delete, the
// new-project modal) and the collapsible session history panel.
//
// No dependency on AppShell.feature.js's private closure state — all
// of this reads/writes the global window.currentProject and DOM, so
// this file takes no ctx. loadProjects/selectProject/updateProfileUI
// are re-exported from the core's public API via thin wrappers (see
// AppShell.feature.js) since window.AppShellFeature advertises them.
// ============================================================

(function () {
    "use strict";

    const MANIFEST = {
        id: "AppShellProjectPanel.component", type: "component", layer: 1,
        runtime: "Browser", version: "1.0.0",
        requires: [],
        dependencies: [],
        docs: { description: "AppShell.feature.js's project list (loadProjects, selectProject, updateActiveProjectUI, updateProfileUI, openNewProjectModal, closeNewProjectModal, plus private rename/duplicate/delete prompts) and the collapsible session history panel (initHistoryPanel, private loadHistory/relativeTime). No ctx needed — no private core state dependency. Extracted from AppShell.feature.js as part of the Phase 5 oversized-file split.", author: "ProtoAI Team" }
    };

    // ── Project Management ────────────────────────────────────

    function openNewProjectModal() {
        const overlay = document.getElementById("newProjectOverlay");
        if (overlay) {
            overlay.classList.remove("hidden");
            overlay.classList.add("sdoa-modal-overlay--visible");
            const input = document.getElementById("npName");
            if (input) { input.value = ""; input.focus(); }
        }
    }

    function closeNewProjectModal() {
        const overlay = document.getElementById("newProjectOverlay");
        if (overlay) {
            overlay.classList.add("hidden");
            overlay.classList.remove("sdoa-modal-overlay--visible");
        }
    }

    async function _promptRenameProject(name) {
        const newName = prompt(`Rename project "${name}" to:`, name);
        if (!newName || newName.trim() === name) return;
        try {
            await window.backendConnector?.runWorkflow("rename_project", { project: name, newName: newName.trim() });
            window.ToastPrim?.show(`Renamed to "${newName.trim()}"`, "success");
            if (window.currentProject === name) window.currentProject = newName.trim();
            await loadProjects();
        } catch (err) {
            window.ToastPrim?.show("Rename failed: " + (err.message || err), "error");
        }
    }

    async function _duplicateProject(name) {
        const newName = prompt(`Duplicate "${name}" as:`, name + " Copy");
        if (!newName || !newName.trim()) return;
        try {
            await window.backendConnector?.runWorkflow("duplicate_project", { project: name, newName: newName.trim() });
            window.ToastPrim?.show(`Duplicated as "${newName.trim()}"`, "success");
            await loadProjects();
        } catch (err) {
            window.ToastPrim?.show("Duplicate failed: " + (err.message || err), "error");
        }
    }

    async function _confirmDeleteProject(name) {
        if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
        try {
            await window.backendConnector?.runWorkflow("delete_project", { project: name });
            window.ToastPrim?.show(`Project "${name}" deleted`, "success");
            if (window.currentProject === name) window.currentProject = null;
            await loadProjects();
        } catch (err) {
            window.ToastPrim?.show("Delete failed: " + (err.message || err), "error");
        }
    }

    async function loadProjects() {
        const list = document.getElementById("projectList");
        if (!list) return;

        try {
            console.log("[AppShell] Syncing projects with backend...");
            const res      = await window.backendConnector?.runWorkflow("projects");
            const projects = res?.projects || res?.data?.projects || [];

            list.innerHTML = projects.map(p => {
                const name   = typeof p === "string" ? p : (p.name || "Unknown");
                const isSelf = name.toLowerCase() === "protoai";
                return `
                    <li class="project-item ${window.currentProject === name ? "active" : ""}" data-project="${name}"
                        style="display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; cursor:pointer; list-style:none; margin-bottom:2px; font-size:12px;">
                        <span class="icon">${isSelf ? "🤖" : "📁"}</span>
                        <span class="name" style="flex:1; font-weight: 500;">${name}</span>
                        ${isSelf ? '<span class="sdoa-badge" style="font-size:9px; background:var(--accent); color:white;">SELF</span>' : ""}
                    </li>
                `;
            }).join("");

            list.querySelectorAll(".project-item").forEach(item => {
                item.addEventListener("click", () => selectProject(item.dataset.project));

                // Right-click context menu for project management
                item.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const p = item.dataset.project;
                    window.ContextMenuPrim?.show({
                        items: [
                            { label: "Open Project",      icon: "📂", onClick: () => selectProject(p) },
                            { separator: true },
                            { label: "Rename Project",    icon: "✏️",  onClick: () => _promptRenameProject(p) },
                            { label: "Duplicate Project", icon: "📋", onClick: () => _duplicateProject(p) },
                            { separator: true },
                            { label: "Delete Project",    icon: "🗑", danger: true, onClick: () => _confirmDeleteProject(p) },
                        ],
                        position: { x: e.clientX, y: e.clientY }
                    });
                });
            });

            const countEl = document.getElementById("projectCount");
            if (countEl) countEl.textContent = projects.length;

            updateActiveProjectUI();
        } catch (err) {
            console.error("[AppShell] Failed to load projects:", err);
            window.ToastPrim?.show("Project list unavailable", "error");
        }
    }

    function selectProject(project) {
        console.log(`[AppShell] Context Switch: ${project}`);
        window.currentProject = project;
        if (window.StateStore) window.StateStore.set("currentProject", project);
        localStorage.setItem("protoai:currentProject", project);
        window.EventBus?.emit("app:projectSelected", { project });
        updateActiveProjectUI();
    }

    function updateActiveProjectUI() {
        document.querySelectorAll(".project-item").forEach(item => {
            item.classList.toggle("active", item.dataset.project === window.currentProject);
        });
        const status = document.getElementById("currentProjectName");
        if (status) status.textContent = window.currentProject || "No project selected";
    }

    function updateProfileUI() {
        const currentProfile = localStorage.getItem("protoai:profile:active") || "default";
        const badge = document.getElementById("profileBadge");
        if (badge) badge.textContent = currentProfile.charAt(0).toUpperCase();
        const text = document.getElementById("currentProfileName");
        if (text) text.textContent = currentProfile;
    }

    // ── History Panel ─────────────────────────────────────────

    function initHistoryPanel() {
        const toggle     = document.getElementById("historyToggle");
        const content    = document.getElementById("historyContent");
        const chevron    = document.getElementById("historyChevron");
        const refreshBtn = document.getElementById("refreshHistoryBtn");
        if (!toggle || !content) return;

        const collapsed = localStorage.getItem("protoai:history:collapsed") !== "false";
        content.style.display = collapsed ? "none" : "block";
        if (chevron) chevron.textContent = collapsed ? "▶" : "▼";

        toggle.addEventListener("click", () => {
            const isHidden = content.style.display === "none";
            content.style.display = isHidden ? "block" : "none";
            if (chevron) chevron.textContent = isHidden ? "▼" : "▶";
            localStorage.setItem("protoai:history:collapsed", isHidden ? "false" : "true");
            if (isHidden) _loadHistory();
        });

        refreshBtn?.addEventListener("click", () => _loadHistory());
        window.EventBus?.on("chat:sessionCreated", () => _loadHistory());
        window.EventBus?.on("app:projectSelected", () => {
            if (content.style.display !== "none") _loadHistory();
        });

        if (!collapsed) _loadHistory();
    }

    async function _loadHistory() {
        const list  = document.getElementById("historyList");
        const empty = document.getElementById("historyListEmpty");
        if (!list) return;

        const project = window.currentProject;
        if (!project) {
            list.innerHTML = "";
            if (empty) { empty.style.display = "block"; empty.textContent = "Select a project first."; }
            return;
        }

        try {
            list.innerHTML = `<li style="padding:8px 12px;color:var(--text-dim);font-size:11px;">Loading…</li>`;
            const res = await window.backendConnector?.runWorkflow("chat_session", { action: "list", project });
            const sessions = (res?.data || res?.sessions || []);

            if (!sessions.length) {
                list.innerHTML = "";
                if (empty) { empty.style.display = "block"; empty.textContent = "No sessions yet."; }
                return;
            }
            if (empty) empty.style.display = "none";

            list.innerHTML = sessions.slice(-25).reverse().map(s => {
                const label = s.name || (s.id ? s.id.slice(0, 10) : "Session");
                const ts    = s.updatedAt || s.createdAt;
                const ago   = ts ? _relativeTime(ts) : "";
                return `<li data-chat-id="${s.id}" style="cursor:pointer;padding:6px 10px;border-radius:6px;font-size:11px;display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">💬 ${label}</span>
                    ${ago ? `<span style="color:var(--text-dim);font-size:9px;flex-shrink:0;">${ago}</span>` : ""}
                </li>`;
            }).join("");

            list.querySelectorAll("[data-chat-id]").forEach(item => {
                item.addEventListener("click", () => {
                    const chatId = item.dataset.chatId;
                    window.EventBus?.emit("chat:loadSession", { project, chatId });
                    window.ToastPrim?.show("Loading session…", "info");
                });
                item.addEventListener("mouseenter", () => item.style.background = "rgba(255,255,255,0.04)");
                item.addEventListener("mouseleave", () => item.style.background = "");
            });
        } catch (err) {
            console.warn("[AppShell] Failed to load history:", err);
            list.innerHTML = `<li style="padding:8px 12px;color:var(--error);font-size:11px;">Failed to load sessions</li>`;
        }
    }

    function _relativeTime(ts) {
        const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
        if (diff < 60)    return `${diff}s ago`;
        if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }

    // ── Exports ───────────────────────────────────────────────

    const component = {
        MANIFEST,
        openNewProjectModal, closeNewProjectModal,
        loadProjects, selectProject, updateActiveProjectUI, updateProfileUI,
        initHistoryPanel
    };
    window.AppShellProjectPanel = component;
    if (window.ModuleLoader) window.ModuleLoader.register(MANIFEST, component);

})();
