// Last modified: 2026-06-01 00:00 UTC
// Diff.prim.js — SDOA v5.0 Primitive (Browser)
// Validated by: ProbationOfficer.workflow.rs
//
// Change log:
//   5.0.0 — Initial implementation. Side-by-side source diff viewer.
//            Pure-JS LCS line diff — no external dependencies.
//            Unchanged regions collapse to context hunks (configurable).
//            Accept / Reject actions emit events for the Coach mutation loop.
//            Designed to make every autonomous Coach mutation reviewable before
//            ProbationOfficer commits it to the portfolio.

(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────
  // LCS-BASED LINE DIFF ENGINE
  // Returns an array of DiffOp: { type: "equal"|"remove"|"add", oldLine, newLine, text }
  // ─────────────────────────────────────────────────────────────

  function diffLines(oldSrc, newSrc) {
    const a = (oldSrc ?? "").split("\n");
    const b = (newSrc ?? "").split("\n");
    const m = a.length, n = b.length;

    // Build LCS table (Myers-lite: O(mn) DP, sufficient for source files)
    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    const ops = [];
    let i = 0, j = 0;

    while (i < m || j < n) {
      if (i < m && j < n && a[i] === b[j]) {
        ops.push({ type: "equal",  oldLine: i + 1, newLine: j + 1, text: a[i] });
        i++; j++;
      } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
        ops.push({ type: "add",    oldLine: null,  newLine: j + 1, text: b[j] });
        j++;
      } else {
        ops.push({ type: "remove", oldLine: i + 1, newLine: null,  text: a[i] });
        i++;
      }
    }

    return ops;
  }

  // Collapse runs of equal lines to context hunks
  // Returns segments: { type: "ops"|"collapsed", ops?, count? }
  function toSegments(ops, contextLines) {
    const ctx     = contextLines ?? 3;
    const n       = ops.length;
    const visible = new Uint8Array(n); // 1 = show, 0 = may collapse

    for (let i = 0; i < n; i++) {
      if (ops[i].type !== "equal") {
        for (let k = Math.max(0, i - ctx); k <= Math.min(n - 1, i + ctx); k++) {
          visible[k] = 1;
        }
      }
    }

    const segments = [];
    let run = null;

    for (let i = 0; i < n; i++) {
      if (visible[i]) {
        if (run) { segments.push({ type: "collapsed", count: run.count }); run = null; }
        const last = segments[segments.length - 1];
        if (last?.type === "ops") { last.ops.push(ops[i]); }
        else { segments.push({ type: "ops", ops: [ops[i]] }); }
      } else {
        if (!run) run = { count: 0 };
        run.count++;
      }
    }

    if (run) segments.push({ type: "collapsed", count: run.count });
    return segments;
  }

  // ─────────────────────────────────────────────────────────────

  class DiffPrim {
    static MANIFEST = {
      // ── Identity ──────────────────────────────
      id:              "Diff.prim",
      type:            "primitive",
      layer:           2,
      runtime:         "Browser",
      version:         "5.0.1",
      operationalRole: "savant",

      // ── Dependencies ──────────────────────────
      requires:  [],
      dependencies: [],
      capabilities: [
        "diff:setDiff",
        "diff:accept",
        "diff:reject",
        "diff:expandAll"
      ],
      dataFiles: [],

      // ── Lifecycle ─────────────────────────────
      lifecycle: ["init", "mount", "update", "unmount", "destroy"],

      // ── Action Surface ────────────────────────
      actions: {
        commands: {
          setDiff: {
            description: "Load a new diff. Both oldSrc and newSrc are full source strings.",
            input:  {
              oldSrc:       "string",
              newSrc:       "string",
              filename:     "string?",
              contextLines: "number?"
            },
            output: "void"
          },
          accept: {
            description: "Emit diff:accepted with the new source. Signals ProbationOfficer to proceed.",
            input:  {},
            output: "void"
          },
          reject: {
            description: "Emit diff:rejected. Signals Coach to retry or discard the mutation.",
            input:  {},
            output: "void"
          },
          expandAll: {
            description: "Show all collapsed context lines.",
            input:  {},
            output: "void"
          }
        },
        events: {
          "diff:accepted": {
            payload: { filename: "string?", newSrc: "string", stats: "object" }
          },
          "diff:rejected": {
            payload: { filename: "string?", reason: "string?" }
          },
          "diff:loaded": {
            payload: { filename: "string?", added: "number", removed: "number", unchanged: "number" }
          }
        },
        accepts: {
          "coach:mutationReady": {
            description: "Receives a Coach mutation payload and loads it as a diff automatically."
          }
        },
        slots: {}
      },

      docs: {
        description: "Side-by-side source diff viewer with a pure-JS LCS line diff engine. Unchanged regions collapse to context hunks. Accept emits diff:accepted for ProbationOfficer; Reject emits diff:rejected back to Coach. Makes every autonomous mutation a reviewable, human-readable change before it lands in the portfolio.",
        author: "ProtoAI Core Architecture Group",
        sdoa:   "5.0.0"
      },
      last_modified: "2026-07-13T00:00:00Z"
    };

    // ── Private State ─────────────────────────
    _container    = null;
    _root         = null;
    _header       = null;
    _diffBody     = null;

    _oldSrc       = "";
    _newSrc       = "";
    _filename     = null;
    _contextLines = 3;
    _ops          = [];
    _stats        = { added: 0, removed: 0, unchanged: 0 };
    _config       = {};
    _busUnsub     = [];

    // ── Lifecycle ─────────────────────────────

    async init(config) {
      this._config       = config ?? {};
      this._contextLines = config?.contextLines ?? 3;
    }

    async mount(container) {
      this._container = container;
      this._buildDOM();
      this._subscribeEventBus();

      window.EventBus?.command?.("diff", "setDiff",   (args) => this.setDiff(args));
      window.EventBus?.command?.("diff", "accept",    ()     => this.accept());
      window.EventBus?.command?.("diff", "reject",    ()     => this.reject());
      window.EventBus?.command?.("diff", "expandAll", ()     => this.expandAll());

      // Load initial diff from config if provided
      if (config?.oldSrc != null || config?.newSrc != null) {
        this.setDiff(config);
      }
    }

    async update(newState) {
      if ("oldSrc" in newState || "newSrc" in newState) {
        this.setDiff(newState);
      }
    }

    async unmount() {
      this._unsubscribeEventBus();
      this._root?.remove();
      this._root = this._header = this._diffBody = null;
    }

    async destroy() {
      this._container = null;
      this._ops = [];
    }

    // ── Public API ────────────────────────────

    setDiff({ oldSrc = "", newSrc = "", filename = null, contextLines = null } = {}) {
      this._oldSrc       = oldSrc;
      this._newSrc       = newSrc;
      this._filename     = filename;
      if (contextLines != null) this._contextLines = contextLines;

      this._ops = diffLines(oldSrc, newSrc);

      this._stats = this._ops.reduce((acc, op) => {
        if (op.type === "add")    acc.added++;
        else if (op.type === "remove") acc.removed++;
        else acc.unchanged++;
        return acc;
      }, { added: 0, removed: 0, unchanged: 0 });

      this._renderHeader();
      this._renderDiff(false);

      window.EventBus?.emit?.("diff:loaded", {
        filename: this._filename,
        ...this._stats
      });
    }

    accept() {
      window.EventBus?.emit?.("diff:accepted", {
        filename: this._filename,
        newSrc:   this._newSrc,
        stats:    { ...this._stats }
      });
      this._flashDecision("accepted");
    }

    reject() {
      window.EventBus?.emit?.("diff:rejected", {
        filename: this._filename,
        reason:   null
      });
      this._flashDecision("rejected");
    }

    expandAll() {
      this._renderDiff(true);
    }

    // ── Rendering ─────────────────────────────

    _renderHeader() {
      if (!this._header) return;
      this._header.replaceChildren();

      // Filename
      const name = document.createElement("span");
      name.className   = "sdoa-diff__filename";
      name.textContent = this._filename ?? "untitled";

      // Stats badges
      const statsWrap = document.createElement("div");
      statsWrap.className = "sdoa-diff__stats";

      const addBadge = this._badge(`+${this._stats.added}`,   "add");
      const remBadge = this._badge(`-${this._stats.removed}`, "remove");
      const eqlBadge = this._badge(`${this._stats.unchanged} unchanged`, "equal");

      statsWrap.appendChild(addBadge);
      statsWrap.appendChild(remBadge);
      statsWrap.appendChild(eqlBadge);

      // Actions
      const actions = document.createElement("div");
      actions.className = "sdoa-diff__actions";

      const expandBtn = document.createElement("button");
      expandBtn.className   = "sdoa-diff__btn";
      expandBtn.textContent = "Expand All";
      expandBtn.addEventListener("click", () => this.expandAll());

      const rejectBtn = document.createElement("button");
      rejectBtn.className   = "sdoa-diff__btn sdoa-diff__btn--reject";
      rejectBtn.textContent = "✕ Reject";
      rejectBtn.addEventListener("click", () => this.reject());

      const acceptBtn = document.createElement("button");
      acceptBtn.className   = "sdoa-diff__btn sdoa-diff__btn--accept";
      acceptBtn.textContent = "✓ Accept";
      acceptBtn.addEventListener("click", () => this.accept());

      actions.appendChild(expandBtn);
      actions.appendChild(rejectBtn);
      actions.appendChild(acceptBtn);

      this._header.appendChild(name);
      this._header.appendChild(statsWrap);
      this._header.appendChild(actions);
    }

    _renderDiff(showAll) {
      if (!this._diffBody) return;
      this._diffBody.replaceChildren();

      if (this._ops.length === 0) {
        const empty = document.createElement("div");
        empty.className   = "sdoa-diff__empty";
        empty.textContent = "No diff loaded.";
        this._diffBody.appendChild(empty);
        return;
      }

      // Column headers
      const colHeaders = document.createElement("div");
      colHeaders.className = "sdoa-diff__col-headers";
      const oldHeader = document.createElement("div");
      oldHeader.className   = "sdoa-diff__col-header";
      oldHeader.textContent = "Before";
      const newHeader = document.createElement("div");
      newHeader.className   = "sdoa-diff__col-header";
      newHeader.textContent = "After";
      colHeaders.appendChild(oldHeader);
      colHeaders.appendChild(newHeader);
      this._diffBody.appendChild(colHeaders);

      const segments = showAll
        ? [{ type: "ops", ops: this._ops }]
        : toSegments(this._ops, this._contextLines);

      for (const seg of segments) {
        if (seg.type === "collapsed") {
          this._diffBody.appendChild(this._makeCollapser(seg.count));
        } else {
          for (const op of seg.ops) {
            this._diffBody.appendChild(this._makeRow(op));
          }
        }
      }
    }

    _makeRow(op) {
      const row = document.createElement("div");
      row.className = `sdoa-diff__row sdoa-diff__row--${op.type}`;

      // Old side
      const oldCell = document.createElement("div");
      oldCell.className = "sdoa-diff__cell sdoa-diff__cell--old";
      if (op.type !== "add") {
        const lineNo = document.createElement("span");
        lineNo.className   = "sdoa-diff__lineno";
        lineNo.textContent = op.oldLine;
        const marker = document.createElement("span");
        marker.className   = "sdoa-diff__marker";
        marker.textContent = op.type === "remove" ? "−" : " ";
        const code = document.createElement("span");
        code.className   = "sdoa-diff__code";
        code.textContent = op.text;
        oldCell.appendChild(lineNo);
        oldCell.appendChild(marker);
        oldCell.appendChild(code);
      }

      // New side
      const newCell = document.createElement("div");
      newCell.className = "sdoa-diff__cell sdoa-diff__cell--new";
      if (op.type !== "remove") {
        const lineNo = document.createElement("span");
        lineNo.className   = "sdoa-diff__lineno";
        lineNo.textContent = op.newLine;
        const marker = document.createElement("span");
        marker.className   = "sdoa-diff__marker";
        marker.textContent = op.type === "add" ? "+" : " ";
        const code = document.createElement("span");
        code.className   = "sdoa-diff__code";
        code.textContent = op.text;
        newCell.appendChild(lineNo);
        newCell.appendChild(marker);
        newCell.appendChild(code);
      }

      row.appendChild(oldCell);
      row.appendChild(newCell);
      return row;
    }

    _makeCollapser(count) {
      const el = document.createElement("div");
      el.className = "sdoa-diff__collapser";

      const btn = document.createElement("button");
      btn.className   = "sdoa-diff__collapser-btn";
      btn.textContent = `↕  ${count} unchanged line${count === 1 ? "" : "s"}  — click to expand`;
      btn.addEventListener("click", () => {
        // Replace this collapser with full diff
        this._renderDiff(true);
      });

      el.appendChild(btn);
      return el;
    }

    _flashDecision(decision) {
      if (!this._root) return;
      this._root.dataset.decision = decision;
      setTimeout(() => {
        if (this._root) delete this._root.dataset.decision;
      }, 1800);
    }

    _badge(text, type) {
      const el = document.createElement("span");
      el.className   = `sdoa-diff__badge sdoa-diff__badge--${type}`;
      el.textContent = text;
      return el;
    }

    // ── DOM Construction ──────────────────────

    _buildDOM() {
      this._root = document.createElement("div");
      this._root.className = "sdoa-diff";

      this._header = document.createElement("div");
      this._header.className = "sdoa-diff__header";

      this._diffBody = document.createElement("div");
      this._diffBody.className = "sdoa-diff__body";

      // Initial empty state
      const empty = document.createElement("div");
      empty.className   = "sdoa-diff__empty";
      empty.textContent = "No diff loaded. Waiting for Coach mutation…";
      this._diffBody.appendChild(empty);

      this._root.appendChild(this._header);
      this._root.appendChild(this._diffBody);
      this._container.appendChild(this._root);
    }

    // ── EventBus Subscriptions ─────────────────

    _subscribeEventBus() {
      if (!window.EventBus) return;

      const onMutationReady = ({ oldSrc, newSrc, filename } = {}) => {
        this.setDiff({ oldSrc, newSrc, filename });
      };

      window.EventBus.on("coach:mutationReady", onMutationReady);
      this._busUnsub = [
        () => window.EventBus.off?.("coach:mutationReady", onMutationReady)
      ];
    }

    _unsubscribeEventBus() {
      this._busUnsub.forEach(fn => fn());
      this._busUnsub = [];
    }
  }

  window.DiffPrim = DiffPrim;
})();
