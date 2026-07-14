// Last modified: 2026-06-01 00:00 UTC
// StatusBar.prim.js — SDOA v5.0 Primitive (Browser)
// Validated by: ProbationOfficer.workflow.rs
//
// Change log:
//   5.0.0 — Initial implementation. Persistent footer strip.
//            Displays live system health: module count, event bus throughput,
//            backend connection status, Pulse telemetry, sovereign alerts
//            (Conductor, Sentinel, ProbationOfficer), Coach activity indicator,
//            and Triage routing mode. Every sovereign's status at a glance.

(function () {
  "use strict";

  // ── Sovereign indicator config ────────────────────────────────
  const SOVEREIGNS = [
    { id: "registrar",         label: "Registrar",  icon: "⬡" },
    { id: "captain",           label: "Captain",    icon: "⚓" },
    { id: "conductor",         label: "Conductor",  icon: "⊕" },
    { id: "coach",             label: "Coach",      icon: "⟳" },
    { id: "probation-officer", label: "Probation",  icon: "⚑" },
    { id: "assembly-line",     label: "Assembly",   icon: "⊞" },
    { id: "triage",            label: "Triage",     icon: "⊗" },
    { id: "oracle",            label: "Oracle",     icon: "◈" }
  ];

  class StatusBarPrim {
    static MANIFEST = {
      // ── Identity ──────────────────────────────
      id:              "StatusBar.prim",
      type:            "primitive",
      layer:           2,
      runtime:         "Browser",
      version:         "5.0.1",
      operationalRole: "savant",

      // ── Dependencies ──────────────────────────
      requires:  [],
      dependencies: [],
      capabilities: [
        "statusbar:setModuleCount",
        "statusbar:setBackendStatus",
        "statusbar:setSovereignStatus",
        "statusbar:pushAlert",
        "statusbar:clearAlerts",
        "statusbar:setTriageMode",
        "statusbar:setCoachActivity",
        "statusbar:setPulseMetric"
      ],
      dataFiles: [],

      // ── Lifecycle ─────────────────────────────
      lifecycle: ["init", "mount", "update", "unmount", "destroy"],

      // ── Action Surface ────────────────────────
      actions: {
        commands: {
          setModuleCount: {
            description: "Update the live module count display.",
            input:  { count: "number" },
            output: "void"
          },
          setBackendStatus: {
            description: "Update the backend connection indicator.",
            input:  { status: "string" },  // "connecting" | "ready" | "error"
            output: "void"
          },
          setSovereignStatus: {
            description: "Update a named sovereign's indicator state.",
            input:  { sovereignId: "string", status: "string", detail: "string?" },
            output: "void"
          },
          pushAlert: {
            description: "Push a transient alert message to the status bar. Auto-clears after duration ms.",
            input:  { message: "string", level: "string?", duration: "number?" },
            output: "void"
          },
          clearAlerts: {
            description: "Clear all active alerts.",
            input:  {},
            output: "void"
          },
          setTriageMode: {
            description: "Display the current Triage routing mode.",
            input:  { mode: "string" },   // "balanced" | "speed" | "safety" | "memory"
            output: "void"
          },
          setCoachActivity: {
            description: "Show or hide the Coach active indicator.",
            input:  { active: "boolean", detail: "string?" },
            output: "void"
          },
          setPulseMetric: {
            description: "Update a displayed Pulse telemetry metric.",
            input:  { label: "string", value: "string" },
            output: "void"
          }
        },
        events: {
          "statusbar:alertClicked": { payload: { message: "string", level: "string" } },
          "statusbar:sovereignClicked": { payload: { sovereignId: "string" } }
        },
        accepts: {
          "registry:moduleRegistered":   { description: "Increments the module count." },
          "registry:moduleDeregistered": { description: "Decrements the module count." },
          "app:backendStatus":           { description: "Updates the backend connection indicator." },
          "pulse:snapshotTaken":         { description: "Updates Pulse telemetry metrics." },
          "pulse:anomalyDetected":       { description: "Pushes an anomaly alert." },
          "coach:mutationReady":         { description: "Sets Coach indicator to active." },
          "diff:accepted":               { description: "Clears Coach indicator." },
          "diff:rejected":               { description: "Clears Coach indicator." },
          "scaffold:moduleGenerated":    { description: "Pushes a brief success alert." },
          "scaffold:probationFailed":    { description: "Pushes a warning alert." },
          "interpreter:rejected":        { description: "Pushes a rejection alert." },
          "chronicle:chainTampered":     { description: "Pushes a critical security alert." }
        },
        slots: {}
      },

      docs: {
        description: "Persistent footer strip. Displays live SDOA system health at a glance: module count, event bus activity rate, backend connection status, Pulse p95 latency, per-sovereign status indicators, Coach activity, Triage routing mode, and transient alerts. Makes the invisible SDOA event mesh a physical, always-visible artifact.",
        author: "ProtoAI Core Architecture Group",
        sdoa:   "5.0.0"
      },
      last_modified: "2026-07-13T00:00:00Z"
    };

    // ── Private State ─────────────────────────
    _container       = null;
    _root            = null;
    _config          = {};
    _busUnsub        = [];
    _alertTimers     = [];
    _tickInterval    = null;

    // Live state
    _moduleCount     = 0;
    _backendStatus   = "connecting";
    _sovereigns      = new Map(); // sovereignId → { status, detail }
    _alerts          = [];        // [{ id, message, level, ts }]
    _triageMode      = "balanced";
    _coachActive     = false;
    _coachDetail     = null;
    _pulseMetrics    = new Map(); // label → value
    _eventRate       = 0;         // events/sec estimated
    _eventTick       = 0;         // raw counter reset each second

    // DOM section refs
    _secModules      = null;
    _secBackend      = null;
    _secSovereigns   = null;
    _secPulse        = null;
    _secTriage       = null;
    _secCoach        = null;
    _secAlerts       = null;
    _secTime         = null;

    // ── Lifecycle ─────────────────────────────

    async init(config) {
      this._config = config ?? {};
      // Pre-seed sovereign map
      for (const s of SOVEREIGNS) {
        this._sovereigns.set(s.id, { status: "unknown", detail: null });
      }
    }

    async mount(container) {
      this._container = container;
      this._buildDOM();
      this._subscribeEventBus();
      this._startClock();

      // Register commands
      const cmds = {
        setModuleCount:    ({ count })                       => this.setModuleCount(count),
        setBackendStatus:  ({ status })                      => this.setBackendStatus(status),
        setSovereignStatus:({ sovereignId, status, detail }) => this.setSovereignStatus(sovereignId, status, detail),
        pushAlert:         ({ message, level, duration })    => this.pushAlert(message, level, duration),
        clearAlerts:       ()                                => this.clearAlerts(),
        setTriageMode:     ({ mode })                        => this.setTriageMode(mode),
        setCoachActivity:  ({ active, detail })              => this.setCoachActivity(active, detail),
        setPulseMetric:    ({ label, value })                => this.setPulseMetric(label, value)
      };
      for (const [name, fn] of Object.entries(cmds)) {
        window.EventBus?.command?.("statusBar", name, fn);
      }
    }

    async update(newState) {
      if (newState.moduleCount   != null) this.setModuleCount(newState.moduleCount);
      if (newState.backendStatus != null) this.setBackendStatus(newState.backendStatus);
    }

    async unmount() {
      this._unsubscribeEventBus();
      this._stopClock();
      this._alertTimers.forEach(clearTimeout);
      this._alertTimers = [];
      this._root?.remove();
      this._root = null;
    }

    async destroy() { this._container = null; }

    // ── Public API ────────────────────────────

    setModuleCount(count) {
      this._moduleCount = count;
      this._renderSection("modules");
    }

    setBackendStatus(status) {
      this._backendStatus = status;
      this._renderSection("backend");
    }

    setSovereignStatus(sovereignId, status, detail = null) {
      this._sovereigns.set(sovereignId, { status, detail });
      this._renderSection("sovereigns");
    }

    pushAlert(message, level = "info", duration = 5000) {
      const id = `alert-${Date.now()}`;
      this._alerts.unshift({ id, message, level, ts: new Date().toISOString() });
      if (this._alerts.length > 5) this._alerts.pop();
      this._renderSection("alerts");

      if (duration > 0) {
        const timer = setTimeout(() => {
          this._alerts = this._alerts.filter(a => a.id !== id);
          this._renderSection("alerts");
        }, duration);
        this._alertTimers.push(timer);
      }
    }

    clearAlerts() {
      this._alerts = [];
      this._alertTimers.forEach(clearTimeout);
      this._alertTimers = [];
      this._renderSection("alerts");
    }

    setTriageMode(mode) {
      this._triageMode = mode;
      this._renderSection("triage");
    }

    setCoachActivity(active, detail = null) {
      this._coachActive = active;
      this._coachDetail = detail;
      this._renderSection("coach");
    }

    setPulseMetric(label, value) {
      this._pulseMetrics.set(label, value);
      this._renderSection("pulse");
    }

    // ── Section Renders ───────────────────────

    _renderSection(name) {
      switch (name) {
        case "modules":    this._renderModules();   break;
        case "backend":    this._renderBackend();   break;
        case "sovereigns": this._renderSovereigns();break;
        case "pulse":      this._renderPulse();     break;
        case "triage":     this._renderTriage();    break;
        case "coach":      this._renderCoach();     break;
        case "alerts":     this._renderAlerts();    break;
        case "time":       this._renderTime();      break;
      }
    }

    _renderModules() {
      if (!this._secModules) return;
      this._secModules.replaceChildren(
        this._chip("⬡", `${this._moduleCount} modules`, "neutral", "Registered module count")
      );
    }

    _renderBackend() {
      if (!this._secBackend) return;
      const map = { connecting: ["connecting", "yellow"], ready: ["ready", "green"], error: ["error", "red"] };
      const [label, color] = map[this._backendStatus] ?? ["unknown", "neutral"];
      this._secBackend.replaceChildren(
        this._chip("◉", label, color, `Backend: ${label}`)
      );
    }

    _renderSovereigns() {
      if (!this._secSovereigns) return;
      this._secSovereigns.replaceChildren();
      for (const s of SOVEREIGNS) {
        const state  = this._sovereigns.get(s.id) ?? { status: "unknown" };
        const color  = { ready: "green", active: "purple", error: "red",
                         warning: "yellow", unknown: "dim" }[state.status] ?? "dim";
        const dot    = document.createElement("button");
        dot.className  = `sdoa-statusbar__sovereign sdoa-statusbar__sovereign--${color}`;
        dot.title      = `${s.label}: ${state.status}${state.detail ? " — " + state.detail : ""}`;
        dot.textContent = s.icon;
        dot.setAttribute("aria-label", s.label);
        dot.addEventListener("click", () => {
          window.EventBus?.emit?.("statusbar:sovereignClicked", { sovereignId: s.id });
        });
        this._secSovereigns.appendChild(dot);
      }
    }

    _renderPulse() {
      if (!this._secPulse) return;
      this._secPulse.replaceChildren();
      // Event rate
      const rateChip = this._chip("⚡", `${this._eventRate}/s`, "neutral", "EventBus events/sec");
      this._secPulse.appendChild(rateChip);
      // Custom Pulse metrics
      for (const [label, value] of this._pulseMetrics) {
        this._secPulse.appendChild(this._chip("▸", `${label}: ${value}`, "neutral", `Pulse: ${label}`));
      }
    }

    _renderTriage() {
      if (!this._secTriage) return;
      const modeColor = { speed: "purple", safety: "green", memory: "blue", balanced: "neutral" };
      this._secTriage.replaceChildren(
        this._chip("⊗", `Triage: ${this._triageMode}`, modeColor[this._triageMode] ?? "neutral", "Active Triage routing mode")
      );
    }

    _renderCoach() {
      if (!this._secCoach) return;
      this._secCoach.replaceChildren();
      if (!this._coachActive) return;
      const chip = this._chip("⟳", this._coachDetail ?? "Coach active", "purple", "Coach is synthesizing a mutation");
      chip.classList.add("sdoa-statusbar__chip--pulse");
      this._secCoach.appendChild(chip);
    }

    _renderAlerts() {
      if (!this._secAlerts) return;
      this._secAlerts.replaceChildren();
      for (const alert of this._alerts) {
        const color = { error: "red", warning: "yellow", info: "neutral", success: "green" }[alert.level] ?? "neutral";
        const chip  = this._chip(
          { error: "✗", warning: "⚠", info: "ℹ", success: "✓" }[alert.level] ?? "●",
          alert.message, color, alert.message
        );
        chip.style.cursor = "pointer";
        chip.addEventListener("click", () => {
          window.EventBus?.emit?.("statusbar:alertClicked", { message: alert.message, level: alert.level });
          this._alerts = this._alerts.filter(a => a.id !== alert.id);
          this._renderSection("alerts");
        });
        this._secAlerts.appendChild(chip);
      }
    }

    _renderTime() {
      if (!this._secTime) return;
      const now = new Date();
      this._secTime.textContent = now.toISOString().slice(11, 19) + " UTC";
    }

    // ── DOM Construction ──────────────────────

    _buildDOM() {
      this._root = document.createElement("div");
      this._root.className = "sdoa-statusbar";
      this._root.setAttribute("role", "status");
      this._root.setAttribute("aria-label", "SDOA system status");

      // Left group: modules + backend + sovereigns
      const left = document.createElement("div");
      left.className = "sdoa-statusbar__group sdoa-statusbar__group--left";

      this._secModules   = document.createElement("div");
      this._secModules.className = "sdoa-statusbar__section";
      this._secBackend   = document.createElement("div");
      this._secBackend.className = "sdoa-statusbar__section";
      this._secSovereigns = document.createElement("div");
      this._secSovereigns.className = "sdoa-statusbar__section sdoa-statusbar__section--sovereigns";

      left.appendChild(this._secModules);
      left.appendChild(this._divider());
      left.appendChild(this._secBackend);
      left.appendChild(this._divider());
      left.appendChild(this._secSovereigns);

      // Center: alerts
      this._secAlerts = document.createElement("div");
      this._secAlerts.className = "sdoa-statusbar__section sdoa-statusbar__section--alerts";

      // Right group: pulse + triage + coach + time
      const right = document.createElement("div");
      right.className = "sdoa-statusbar__group sdoa-statusbar__group--right";

      this._secPulse  = document.createElement("div");
      this._secPulse.className = "sdoa-statusbar__section";
      this._secTriage = document.createElement("div");
      this._secTriage.className = "sdoa-statusbar__section";
      this._secCoach  = document.createElement("div");
      this._secCoach.className = "sdoa-statusbar__section";
      this._secTime   = document.createElement("div");
      this._secTime.className = "sdoa-statusbar__time";

      right.appendChild(this._secPulse);
      right.appendChild(this._divider());
      right.appendChild(this._secTriage);
      right.appendChild(this._divider());
      right.appendChild(this._secCoach);
      right.appendChild(this._divider());
      right.appendChild(this._secTime);

      this._root.appendChild(left);
      this._root.appendChild(this._secAlerts);
      this._root.appendChild(right);
      this._container.appendChild(this._root);

      // Initial render
      ["modules","backend","sovereigns","pulse","triage","coach","alerts","time"]
        .forEach(s => this._renderSection(s));
    }

    _chip(icon, label, color, title) {
      const el = document.createElement("span");
      el.className   = `sdoa-statusbar__chip sdoa-statusbar__chip--${color}`;
      el.title       = title ?? label;

      const ic = document.createElement("span");
      ic.className   = "sdoa-statusbar__chip-icon";
      ic.textContent = icon;

      const tx = document.createElement("span");
      tx.className   = "sdoa-statusbar__chip-label";
      tx.textContent = label;

      el.appendChild(ic);
      el.appendChild(tx);
      return el;
    }

    _divider() {
      const d = document.createElement("span");
      d.className   = "sdoa-statusbar__divider";
      d.textContent = "│";
      return d;
    }

    // ── Clock & Event Rate ────────────────────

    _startClock() {
      this._tickInterval = setInterval(() => {
        this._eventRate = this._eventTick;
        this._eventTick = 0;
        this._renderSection("time");
        this._renderSection("pulse");
      }, 1000);
    }

    _stopClock() {
      if (this._tickInterval) { clearInterval(this._tickInterval); this._tickInterval = null; }
    }

    // ── EventBus Subscriptions ─────────────────

    _subscribeEventBus() {
      if (!window.EventBus) return;

      const handlers = {
        "registry:moduleRegistered":   ()       => this.setModuleCount(this._moduleCount + 1),
        "registry:moduleDeregistered": ()       => this.setModuleCount(Math.max(0, this._moduleCount - 1)),
        "app:backendStatus":           ({ status }) => this.setBackendStatus(status),
        "pulse:snapshotTaken":         ({ moduleCount }) => {
          if (moduleCount != null) this.setModuleCount(moduleCount);
        },
        "pulse:anomalyDetected":       ({ moduleId, metric, value, threshold }) =>
          this.pushAlert(`Anomaly: ${moduleId} ${metric} = ${value} (threshold ${threshold})`, "warning", 8000),
        "coach:mutationReady":         ({ filename }) => this.setCoachActivity(true, filename ?? "synthesizing…"),
        "diff:accepted":               ()       => this.setCoachActivity(false),
        "diff:rejected":               ()       => this.setCoachActivity(false),
        "scaffold:moduleGenerated":    ({ moduleId }) => this.pushAlert(`✓ Scaffolded: ${moduleId}`, "success", 4000),
        "scaffold:probationFailed":    ({ filename, errors }) =>
          this.pushAlert(`Probation failed: ${filename} — ${errors?.[0] ?? ""}`, "warning", 7000),
        "interpreter:rejected":        ({ reason }) =>
          this.pushAlert(`Interpreter rejected: ${reason}`, "error", 6000),
        "chronicle:chainTampered":     ({ failedAtId }) =>
          this.pushAlert(`⚠ CHAIN TAMPERED at ${failedAtId?.slice(0, 12)}…`, "error", 0)
      };

      const unsubs = [];
      for (const [event, handler] of Object.entries(handlers)) {
        // Count every subscription tick for event rate
        const wrapped = (...args) => { this._eventTick++; handler(...args); };
        window.EventBus.on(event, wrapped);
        unsubs.push(() => window.EventBus.off?.(event, wrapped));
      }

      // Optional: wildcard counter
      if (window.EventBus.onAny) {
        const counter = () => this._eventTick++;
        window.EventBus.onAny(counter);
        unsubs.push(() => window.EventBus.offAny?.(counter));
      }

      this._busUnsub = unsubs;
    }

    _unsubscribeEventBus() {
      this._busUnsub.forEach(fn => fn());
      this._busUnsub = [];
    }
  }

  window.StatusBarPrim = StatusBarPrim;
})();
