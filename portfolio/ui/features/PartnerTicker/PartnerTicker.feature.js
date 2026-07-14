/* ============================================================
   PartnerTicker.feature.js — SDOA v4 Feature
   version: 4.2.0
   Last modified: 2026-05-13 12:50 UTC
   v4.2.0: Circuit-breaker for commentary — after 2 consecutive
     failures, suppresses retries for 5 minutes to avoid flooding
     the ticker with timeout errors.
   ============================================================ */

(function () {
    "use strict";

    const MANIFEST = {
        id: "PartnerTicker.feature",
        type: "feature",
        layer: 1,
        runtime: "Browser",
        version: "4.2.1",
        requires: ["Toast.prim"],
        dependencies: ["Toast.prim"],
        capabilities: ["partnerticker:display", "partnerticker:commentary", "partnerticker:featureToggles"],
        docs: {
            description: "Silent Partner activity ticker. Displays system events and spontaneous commentary.",
            author: "ProtoAI Team"
        },
        last_modified: "2026-07-13T00:00:00Z"
    };

    const EVENT_META = {
        "orchestrator:routing":    { icon: "🔀", label: (d) => "routing request…",                     color: "dim"    },
        "orchestrator:routed":     { icon: "✓",  label: (d) => `→ ${d.profile || "default"} (${d.complexity || "?"})`, color: "ok"  },
        "orchestrator:engineering":{ icon: "✏️", label: (d) => "engineering prompt…",                   color: "dim"    },
        "orchestrator:engineered": { icon: "✓",  label: (d) => `optimised ${d.originalLen}→${d.optimizedLen} chars`,   color: "ok"  },
        "orchestrator:watching":   { icon: "👁",  label: (d) => `watching (${d.bufferLen} chars)…`,      color: "dim"    },
        "orchestrator:flagged":    { icon: "⚠",  label: (d) => `flagged: ${(d.flag || "").slice(0,60)}`, color: "warn"   },
        "orchestrator:auditing":   { icon: "🔍", label: (d) => "auditing response…",                    color: "dim"    },
        "orchestrator:audited":    { icon: "✓",  label: (d) => `score ${d.score ?? "?"}/10 — ${(d.note || "").slice(0,40)}`, color: "ok" },
        "orchestrator:commentary_generating": { icon: "💭", label: (d) => `thinking…`, color: "dim" },
        "orchestrator:commentary": { icon: "💬", label: (d) => d.text, color: (d) => d.persona },
        "orchestrator:error":      { icon: "✗",  label: (d) => `[${d.stage}] ${(d.message||"").slice(0,60)}`, color: "err" },
        "local:modelLoaded":       { icon: "🧠", label: (d) => "local model ready",                     color: "ok"     },
        "route_error":             { icon: "✗",  label: (d) => `route error: ${(d.error||"").slice(0,50)}`, color: "err" },
        "audit_error":             { icon: "✗",  label: (d) => `audit error: ${(d.error||"").slice(0,50)}`, color: "err" },
    };

    const STORAGE_ENABLED = "protoai:orchestrator:enabled";
    const STORAGE_TOGGLES = "protoai:partner:toggles";
    const STORAGE_STATE   = "protoai:ticker:state";
    const STORAGE_PERSONA = "sdoa.pt.persona";
    const STORAGE_PULSE   = "sdoa.pt.pulse_freq";

    let _container    = null;
    let _log          = [];
    let _tickerItems  = [];
    let _state        = localStorage.getItem(STORAGE_STATE) || "locked";
    let _persona      = localStorage.getItem(STORAGE_PERSONA) || "advisor";
    let _pulseFreq    = parseInt(localStorage.getItem(STORAGE_PULSE) || "10", 10); // Default 10 mins
    let _hoverTimer   = null;
    let _heartbeatTimer = null;
    let _toggles      = _loadToggles();
    let _commentaryFailCount = 0;      // consecutive failures
    let _commentaryCooldownUntil = 0;  // epoch ms — suppress retries until this time
    const COMMENTARY_MAX_FAILS   = 2;
    const COMMENTARY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

    function _loadToggles() { try { return JSON.parse(localStorage.getItem(STORAGE_TOGGLES) || "{}"); } catch (_) { return {}; } }
    function _saveToggles() { localStorage.setItem(STORAGE_TOGGLES, JSON.stringify(_toggles)); }
    function _isEnabled()   { return localStorage.getItem(STORAGE_ENABLED) !== "false"; }

    const FEATURES = [
        { key: "route",    label: "Route" },
        { key: "engineer", label: "Engineer" },
        { key: "watch",    label: "Watch" },
        { key: "audit",    label: "Audit" },
    ];

    const FACETS = [
        { key: "advisor", label: "Advisor" },
        { key: "critic",  label: "Critic" },
        { key: "friend",  label: "Friend" },
        { key: "comedy",  label: "Comedy" },
        { key: "slutty",  label: "Slutty" },
        { key: "slutty_nsfw", label: "Slutty (NSFW)" },
        { key: "scary",   label: "Scary" },
        { key: "scared",  label: "Scared" },
        { key: "alien",   label: "Alien" }
    ];

    async function init() {
        console.log(`[PartnerTicker.feature] Initializing v${MANIFEST.version}...`);
        window.PartnerTicker = { pushEvent, playback, render: mount }; // Compatibility
    }

    async function mount(container) {
        _container = container;
        if (!_container) return;
        _container.innerHTML = "";
        _container.className = "partner-ticker";
        _container.innerHTML = `
            <div class="pt-panel-log" style="flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:8px;"></div>
        `;

        _renderPanel();
        _wireGlobalUI();
        _wireBusEvents();
        _startHeartbeat();
    }

    function _wireGlobalUI() {
        const input = document.getElementById("assistantInput");
        const sendBtn = document.getElementById("assistantSendBtn");

        sendBtn?.addEventListener("click", () => {
            const text = input.value.trim();
            if (text) {
                input.value = "";
                // Optimistically show user whisper
                pushEvent("user_whisper", { text: text, persona: "user" });
                _generateCommentary("User whispered: " + text, null);
            } else {
                _generateCommentary("Manual trigger: Provide an immediate observation.", "Look at the current project context and provide a spontaneous, helpful observation or critique.");
            }
        });

        input?.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendBtn.click();
            }
        });

        // Assistant settings context menu
        const settingsBtn = document.getElementById("assistantSettingsBtn");
        settingsBtn?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = settingsBtn.getBoundingClientRect();
            const menuItems = [
                { label: "Pulse Frequency: " + _pulseFreq + "m", onClick: () => {
                    const freqs = [1, 5, 10, 15, 30, 60];
                    const next = freqs[(freqs.indexOf(_pulseFreq) + 1) % freqs.length];
                    _pulseFreq = next;
                    localStorage.setItem(STORAGE_PULSE, _pulseFreq);
                    window.ToastPrim?.show(`Heartbeat frequency: ${_pulseFreq}m`, "info");
                    _startHeartbeat();
                }},
                { separator: true },
                ...FACETS.map(f => {
                    const active = f.key === "slutty_nsfw"
                        ? _toggles['facet_' + f.key] === true
                        : _toggles['facet_' + f.key] !== false;
                    return {
                        label: (active ? "☑ " : "☐ ") + f.label,
                        onClick: () => {
                            const newState = !active;
                            if (f.key === "slutty_nsfw" && newState === true) {
                                const confirmed = confirm(
                                    "DISCLAIMER:\nThe Slutty (NSFW) persona generates explicitly flirtatious, highly sexually suggestive, and uninhibited comments.\n\nAre you sure you want to enable this NSFW persona?"
                                );
                                if (!confirmed) return;
                            }
                            _toggles['facet_' + f.key] = newState;
                            _saveToggles();
                        }
                    };
                })
            ];
            window.ContextMenuPrim?.show({ items: menuItems, position: { x: rect.left, y: rect.bottom + 4 } });
        });

        const statusModel1 = document.getElementById("statusModel1");
        statusModel1?.addEventListener("click", (e) => {
            e.preventDefault();
            const rect = statusModel1.getBoundingClientRect();
            window.ContextMenuPrim?.show({
                items: [
                    { label: "Local 1.5B Model", icon: "🧠" },
                    { separator: true },
                    { label: "Model Info: Qwen-1.5B", icon: "ℹ️" },
                    { label: "Status: Online", icon: "🟢" }
                ],
                position: { x: rect.left, y: rect.bottom + 4 }
            });
        });

        const statusModel3 = document.getElementById("statusModel3");
        statusModel3?.addEventListener("click", (e) => {
            e.preventDefault();
            const rect = statusModel3.getBoundingClientRect();
            window.ContextMenuPrim?.show({
                items: [
                    { label: "OpenRouter API", icon: "🌐" },
                    { separator: true },
                    { label: "Fallback Enabled", icon: "☑" },
                    { label: "Configure API Key", icon: "⚙", onClick: () => window.openSettingsPanel?.() }
                ],
                position: { x: rect.left, y: rect.bottom + 4 }
            });
        });
    }

    // ── Bubble Placement ──────────────────────────────────────

    function _pickJustification() {
        const positions = ["full-left", "33-left", "center", "33-right", "full-right"];
        // Find the last 2 bubble justifications in the log
        const recentBubbles = _log
            .filter(e => e.justification)
            .slice(-2)
            .map(e => e.justification);
        // If the last 2 are identical, exclude that position to prevent 3-in-a-row
        let allowed = positions;
        if (recentBubbles.length >= 2 && recentBubbles[0] === recentBubbles[1]) {
            allowed = positions.filter(p => p !== recentBubbles[0]);
        }
        return allowed[Math.floor(Math.random() * allowed.length)];
    }

    function pushEvent(type, data = {}) {
        let meta = EVENT_META[type];
        if (!meta) {
            if (type === "user_whisper") meta = { icon: "👤", label: (d) => d.text, color: () => "user" };
            else meta = { icon: "·", label: () => type, color: () => "dim" };
        }

        // Resolve dynamic color if it's a function
        let colorStr = typeof meta.color === "function" ? meta.color(data) : meta.color;

        // Cleanup: remove "thinking..." when an actual response or error arrives
        if (type === "orchestrator:commentary" || type === "orchestrator:error") {
            _log = _log.filter(item => item.type !== "orchestrator:commentary_generating");
        }

        // Deduplication: prevent stacking consecutive "thinking..." messages
        if (type === "orchestrator:commentary_generating") {
             if (_log.length > 0 && _log[_log.length - 1].type === "orchestrator:commentary_generating") {
                 return;
             }
        }

        let justification = null;
        if (type === "orchestrator:commentary" || type === "user_whisper") {
            justification = _pickJustification();
        }

        const entry = { type, data, icon: meta.icon, text: meta.label(data), color: colorStr, justification, ts: Date.now() };
        _log.push(entry);
        if (_log.length > 100) _log.shift();

        _renderPanel();
    }

    function playback(events = []) {
        let delay = 0;
        for (const ev of events) {
            const type = ev.type.startsWith("orchestrator:") ? ev.type : `orchestrator:${ev.type}`;
            setTimeout(() => {
                window.EventBus?.emit(type, ev.data || {}); // Global emit catches in our own bus.on handler
            }, delay);
            delay += 220;
        }
    }

    function _renderPanel() {
        const logContainer = _container?.querySelector(".pt-panel-log");
        if (!logContainer) return;

        // Separate thinking indicators — they always render pinned at the bottom
        const recent  = _log.slice(-50).filter(e => e.type !== "orchestrator:commentary_generating");
        const thinking = _log.filter(e => e.type === "orchestrator:commentary_generating");

        const mainHtml = recent.length === 0
            ? `<div class="pt-log-empty">Waiting for chat...</div>`
            : recent.map(e => {
                if (e.type === "orchestrator:commentary" || e.type === "user_whisper") {
                    const personaName = e.color === "user" ? "User" : e.color;
                    const capitalized = personaName.charAt(0).toUpperCase() + personaName.slice(1);
                    const tooltipText = e.color === "user" ? "User Whisper" : `${capitalized} Persona`;
                    return `<div class="pt-bubble-container pt-bubble-${e.justification || "full-left"}">
                        <div class="pt-bubble" style="position: relative;">
                            <span class="pt-bubble-text pt-${e.color}">${_esc(e.text)}</span>
                            <div class="pt-tooltip">${tooltipText}</div>
                        </div>
                    </div>`;
                }
                return `<div class="pt-log-row">
                    <span class="pt-log-icon">${e.icon}</span>
                    <span class="pt-log-text pt-${e.color}">${_esc(e.text)}</span>
                </div>`;
            }).join("");

        // Thinking indicator — pinned at very bottom with animated dot
        const thinkingHtml = thinking.length > 0
            ? `<div class="pt-thinking-row"><span class="pt-thinking-dot"></span><span class="pt-dim">💭 thinking…</span></div>`
            : "";

        logContainer.innerHTML = mainHtml + thinkingHtml;
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    let _eventsWired = false;
    function _wireBusEvents() {
        if (_eventsWired) return;
        _eventsWired = true;
        const bus = window.EventBus;
        if (!bus) return;
        Object.keys(EVENT_META).forEach(type => bus.on(type, (data) => pushEvent(type, data || {})));

        // Background Observations
        console.log("[PartnerTicker] Wiring bus events...");
        bus.on("app:projectSelected", (payload) => {
            console.log("[PartnerTicker] Project selected event received:", payload);
            if (_isEnabled()) {
                setTimeout(() => {
                    _generateCommentary(`I just switched to the project: ${payload.project}`, "Observe the project and say something brief.");
                }, 1000);
            }
        });

        // Main chat completed — run sidebar commentary independently (non-blocking).
        // Chat.feature always routes the prime message to OpenRouter directly; this
        // listener is the only place the LOCAL PARTNER reacts to chat messages.
        bus.on("chat:messageComplete", (payload) => {
            if (_isEnabled() && payload?.message && payload?.response) {
                _generateCommentary(payload.message, payload.response, payload.id);
            }
        });

        // Check actual system status instead of hardcoding
        _checkActualSystemStatus();
    }

    async function _checkActualSystemStatus() {
        try {
            const res = await window.backendConnector?.runWorkflow("check_system_status");
            if (res?.localAiReady) {
                // Status is now reflected purely in the UI icons at the top of the Assistant Panel
                const status1 = document.querySelector("#statusModel1 span");
                if (status1) { status1.style.color = "var(--success)"; status1.textContent = "●"; }
            } else {
                const status1 = document.querySelector("#statusModel1 span");
                if (status1) { status1.style.color = "var(--error)"; status1.textContent = "●"; }
                window.ToastPrim?.show("Local AI not provisioned. Visit Settings to set up.", "info");
            }
        } catch (err) {
            console.warn("[PartnerTicker] Failed to check system status:", err);
        }
    }

    let _watchdogTimer = null;

    async function _generateSinglePersonaCommentary(persona, message, response, msgId = null) {
        if (!window.backendConnector) return;

        const thinkingId = `think_${persona}_${Date.now()}`;
        let watchdogFired = false;

        const watchdogTimer = setTimeout(() => {
            watchdogFired = true;
            _commentaryFailCount++;
            if (_commentaryFailCount >= COMMENTARY_MAX_FAILS) {
                _commentaryCooldownUntil = Date.now() + COMMENTARY_COOLDOWN_MS;
                console.warn(`[PartnerTicker] Commentary for ${persona} timed out. Cooling down.`);
                pushEvent("orchestrator:error", { stage: `Silent Partner (${persona})`, message: `Commentary timed out. Pausing for 5 min (${_commentaryFailCount} fails).` });
            } else {
                console.warn(`[PartnerTicker] Commentary for ${persona} timed out.`);
                pushEvent("orchestrator:error", { stage: `Silent Partner (${persona})`, message: "Commentary generation timed out." });
            }
            window.EventBus?.emit("app:force_reset");
        }, 300000);

        pushEvent("orchestrator:commentary_generating", { persona, id: thinkingId });

        try {
            const res = await window.backendConnector.runWorkflow("PartnerCommentary.workflow", {
                message, response, persona, msgId
            });

            if (watchdogFired) return;

            if (res?.ok === false) {
                const msg = res.error || res.detail || "Backend returned an error";
                pushEvent("orchestrator:error", { stage: `commentary (${persona})`, message: msg });
            } else {
                _commentaryFailCount = 0;
            }
        } catch (err) {
            if (watchdogFired) return;
            _commentaryFailCount++;
            if (_commentaryFailCount >= COMMENTARY_MAX_FAILS) {
                _commentaryCooldownUntil = Date.now() + COMMENTARY_COOLDOWN_MS;
            }
            console.warn(`[PartnerTicker] Commentary failed for ${persona}:`, err);
            const msg = (typeof err === "string") ? err : (err.message || JSON.stringify(err));
            pushEvent("orchestrator:error", { stage: `commentary (${persona})`, message: msg || "Failed to generate commentary." });
        } finally {
            clearTimeout(watchdogTimer);
            _log = _log.filter(item => item.data?.id !== thinkingId);
            _renderPanel();
        }
    }

    async function _generateCommentary(message, response, msgId = null) {
        // Circuit-breaker: if we've had too many consecutive failures,
        // don't keep hammering the backend — wait out the cooldown.
        if (_commentaryFailCount >= COMMENTARY_MAX_FAILS && Date.now() < _commentaryCooldownUntil) {
            console.log(`[PartnerTicker] Commentary circuit-breaker active (${_commentaryFailCount} fails). Cooldown until ${new Date(_commentaryCooldownUntil).toLocaleTimeString()}.`);
            return;
        }
        // Reset breaker if cooldown has expired
        if (Date.now() >= _commentaryCooldownUntil) {
            _commentaryFailCount = 0;
        }

        const activeFacets = [];
        FACETS.forEach(f => {
            const active = f.key === "slutty_nsfw"
                ? _toggles['facet_' + f.key] === true
                : _toggles['facet_' + f.key] !== false;
            if (active) {
                activeFacets.push(f.key);
            }
        });
        if (activeFacets.length === 0) {
            activeFacets.push(_persona);
        }

        activeFacets.forEach(persona => {
            _generateSinglePersonaCommentary(persona, message, response, msgId)
                .catch(err => console.error(`[PartnerTicker] Error on ${persona}:`, err.message));
        });
    }

    function _startHeartbeat() {
        if (_heartbeatTimer) clearTimeout(_heartbeatTimer);

        // Randomized pulse around the user-defined frequency (+/- 20% jitter)
        const baseMs = _pulseFreq * 60 * 1000;
        const jitter = baseMs * 0.2;
        const delay  = baseMs + (Math.random() * jitter * 2 - jitter);

        _heartbeatTimer = setTimeout(async () => {
            if (_isEnabled()) {
                console.log("[PartnerTicker] Heartbeat pulse...");
                await _generateCommentary("Just checking in on the idle workspace.", "Spontaneously say something brief, in-character, and observant about the current atmosphere or project.");
            }
            _startHeartbeat(); // Schedule next
        }, delay);
    }

    function _startPulse() {
        const dot = _container?.querySelector("#ptDot");
        if (!dot) return;
        setInterval(() => {
            const active = _log.length > 0 && (Date.now() - _log[_log.length - 1].ts) < 8000;
            dot.className = `pt-dot ${active ? "pt-dot-active" : ""}`;
        }, 1000);
    }

    function _esc(str) { return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    function _relTime(ts) {
        const diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 5)    return "just now";
        if (diff < 60)   return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        return `${Math.floor(diff / 3600)}h ago`;
    }

    // ── Module Registration ──────────────────────────────────
    window.ModuleLoader?.register(MANIFEST, { init, mount });
    window.PartnerTickerFeature = { pushEvent, playback, mount };

})();
