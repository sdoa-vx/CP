// ============================================================
// Last modified: 2026-07-13T00:00:00Z
// app.js — SDOA Surface Layer (Bootloader)
// version: 2.0.2 (SDOA v4)
// ============================================================

const MANIFEST = {
    id:      "App.workflow",
    type:    "workflow",
    layer:   3,
    runtime: "Browser",
    version: "2.0.2",
    requires: ["BackendConnector.ui", "ModuleLoader.service", "StateStore.adapter", "SplashScreen.feature"],
    dependencies: ["BackendConnector.ui", "ModuleLoader.service", "StateStore.adapter", "SplashScreen.feature"],
    capabilities: [
        "app:boot",
        "app:bridgeWait",
        "app:settingsHydration",
        "app:mountFeatures"
    ],
    docs: {
        description: "Top-level SDOA surface bootloader: waits for the Tauri engine bridge, hydrates settings, gates on the splash screen, applies layout classes/theme, then initializes and mounts all registered feature modules via ModuleLoader.",
        author: "ProtoAI Team"
    },
    last_modified: "2026-07-13T00:00:00Z"
};

let backend = null;

async function init() {
    const bootLog = (msg) => {
        console.log(`[app.js] ${msg}`);
        const el = document.getElementById("boot-status");
        if (el) el.textContent = msg;
    };

    try {
        bootLog("Initializing environment...");
        backend = window.backendConnector;

        const sidebarStatus = document.getElementById("sidebarStatusText");
        if (sidebarStatus) sidebarStatus.textContent = "Connecting…";

        // Hard 5-second safety timeout for the bridge
        const ready = await Promise.race([
            _waitForBridge(),
            new Promise(r => setTimeout(() => r(false), 5000))
        ]);

        if (!ready) {
            console.warn("[app.js] Engine bridge UNRESPONSIVE — booting in degraded mode");
            backend?.setBackendStatus("unavailable", "Engine Deadlock");
        } else {
            backend?.setBackendStatus("tauri");
        }

        if (sidebarStatus) {
            sidebarStatus.textContent = ready ? "Tauri IPC" : "Disconnected";
            const dot = document.getElementById("statusDot");
            if (dot) dot.style.background = ready ? "var(--color-ok)" : "var(--color-error)";
        }

        // ── Settings Hydration ────────────────────────────────
        let settings = {};
        try {
            if (ready && backend?.runWorkflow) {
                const res = await backend.runWorkflow("settings_get");
                settings = res?.settings || res?.data?.settings || {};
            } else {
                throw new Error("Backend offline");
            }
        } catch (err) {
            console.warn("[app.js] Settings read from backend failed, using local cache:", err.message);
        }

        // Merge with StateStore settings
        const localSettings = window.StateStore?.get("settings") || {};
        settings = { ...settings, ...localSettings };

        // ── Splash Screen Gate ────────────────────────────────
        let confirmedSettings = settings;
        if (window.SplashScreenFeature) {
            bootLog("Awaiting configuration...");
            confirmedSettings = await window.SplashScreenFeature.open(settings);
        }

        // Apply state store
        window.StateStore?.set("settings", confirmedSettings);

        // Apply classes/styles to DOM
        const appEl = document.getElementById("app");
        if (appEl) {
            appEl.classList.remove("booting", "no-assistant", "no-ticker", "no-sidebar-right", "no-header", "no-chat", "no-file-manager", "single-routing");

            const comp = confirmedSettings.ui?.components || {};
            const assistantEnabled = confirmedSettings.assistant?.enabled !== false;

            if (!assistantEnabled || comp.sidebarLeft === false) {
                appEl.classList.add("no-assistant");
            }
            if (comp.partnerTicker === false) {
                appEl.classList.add("no-ticker");
            }
            if (comp.sidebarRight === false) {
                appEl.classList.add("no-sidebar-right");
            }
            if (comp.mainHeader === false) {
                appEl.classList.add("no-header");
            }
            if (comp.chat === false) {
                appEl.classList.add("no-chat");
            }
            if (comp.fileManager === false) {
                appEl.classList.add("no-file-manager");
            }
            if (confirmedSettings.routing?.routingMode === "single") {
                appEl.classList.add("single-routing");
            }
        }

        const root = document.documentElement;
        const front = confirmedSettings.frontend || {};
        if (front.themeBgDeep) root.style.setProperty("--bg-deep", front.themeBgDeep);
        if (front.themeBgSurface) root.style.setProperty("--bg-surface", front.themeBgSurface);
        if (front.themeAccent) root.style.setProperty("--accent", front.themeAccent);

        // ── SDOA v4 Boot ──────────────────────────────────────
        if (window.ModuleLoader) {
            bootLog("Initializing modules...");
            await window.ModuleLoader.initAll();

            bootLog("Mounting UI...");
            const containers = {
                "AppShell.feature":     document.body,
                "ProjectManager.feature": document.body,
                "ModelManager.feature": document.body,
                "Settings.feature":     document.body
            };

            const comp = confirmedSettings.ui?.components || {};
            const assistantEnabled = confirmedSettings.assistant?.enabled !== false;

            if (comp.chat !== false) {
                containers["Chat.feature"] = document.getElementById("pane-left");
            }
            if (comp.fileManager !== false) {
                containers["FileExplorer.feature"] = document.getElementById("rightPaneContent");
            }
            if (assistantEnabled && comp.partnerTicker !== false) {
                containers["PartnerTicker.feature"] = document.getElementById("partnerTickerHost");
            }

            await window.ModuleLoader.mountAll(containers);
        }

        bootLog("Ready");
        setTimeout(() => document.getElementById("boot-status")?.remove(), 1000);
    } catch (err) {
        console.error("[app.js] Critical Boot failure:", err);
        bootLog("Error: " + err.message);
    }
}

async function _waitForBridge(maxAttempts = 10, intervalMs = 500) {
    if (!window.__TAURI__) return false;
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const status = await window.__TAURI__.core.invoke("engine_status").catch(() => null);
            if (status === "ready") return true;
        } catch { /* spin */ }
        await new Promise(r => setTimeout(r, intervalMs));
    }
    return false;
}

document.addEventListener("DOMContentLoaded", () => {
    init();
});
