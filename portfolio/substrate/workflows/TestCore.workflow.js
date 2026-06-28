// ──────────────────────────────────────────────────────────────────
// File:    TestCore.workflow.js
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure; FIXED broken require path
//          for ResponseFormatter (was "../ResponseFormatter.service", now
//          "../services/ResponseFormatter.service")
// ──────────────────────────────────────────────────────────────────
// TestCore.workflow.js — SDOA v5.0 Workflow (NodeJS)
// Validated by: ProbationOfficer.workflow.rs
//
// Change log:
//   5.0.0 — Initial implementation. SDOA self-healing test runner.
//            Auto-discovers *.tests.json assertion suites declared in
//            module MANIFESTs via optimization.assertionSuite.
//            Runs each suite, collects results, pipes failures directly
//            to Coach.workflow.py. Closes the Phase 3 cognitive loop:
//            TestCore detects → Coach synthesizes fix → ProbationOfficer
//            validates → Registrar hot-swaps → TestCore re-runs.

"use strict";

const fs   = require("fs");
const path = require("path");
const ResponseFormatter = require("../services/ResponseFormatter.service");

// ── Assertion operators ────────────────────────────────────────
const OPERATORS = {
  eq:         (a, b) => a === b,
  neq:        (a, b) => a !== b,
  gt:         (a, b) => a >   b,
  gte:        (a, b) => a >=  b,
  lt:         (a, b) => a <   b,
  lte:        (a, b) => a <=  b,
  contains:   (a, b) => String(a).includes(String(b)),
  startsWith: (a, b) => String(a).startsWith(String(b)),
  endsWith:   (a, b) => String(a).endsWith(String(b)),
  type:       (a, b) => typeof a === b,
  truthy:     (a)    => !!a,
  falsy:      (a)    => !a,
  null:       (a)    => a === null || a === undefined,
  notNull:    (a)    => a !== null && a !== undefined,
  arrayLen:   (a, b) => Array.isArray(a) && a.length === b,
  matches:    (a, b) => new RegExp(b).test(String(a))
};

class TestCoreWorkflow {
  static MANIFEST = {
    // ── Identity ──────────────────────────────
    id:              "TestCore.workflow",
    type:            "workflow",
    layer:           3,
    runtime:         "NodeJS",
    version:         "5.0.0",
    operationalRole: "savant",

    // ── Dependencies ──────────────────────────
    requires:  [
      "Oracle.service",
      "Chronicle.service",
      "ResponseFormatter.service"
      // Coach.workflow.py — resolved lazily
    ],
    dataFiles: [],

    // ── Lifecycle ─────────────────────────────
    lifecycle: ["init", "run", "dispose"],

    // ── Action Surface ────────────────────────
    actions: {
      commands: {
        run: {
          description: "Discover and run all assertion suites in the registry. Returns a full test report. Pipes failures to Coach automatically.",
          input: {
            moduleFilter:  "string?",   // Only run suites for modules matching this id substring
            failFast:      "boolean?",  // Stop on first failure (default: false)
            notifyCoach:   "boolean?",  // Send failures to Coach (default: true)
            dryRun:        "boolean?"   // Discover suites but don't execute assertions
          },
          output: "object"  // TestReport
        },
        runSuite: {
          description: "Run a single named assertion suite file directly.",
          input: {
            suitePath:   "string",
            moduleId:    "string?",
            notifyCoach: "boolean?"
          },
          output: "object"  // SuiteResult
        },
        listSuites: {
          description: "Return all discovered assertion suites without running them.",
          input:  { moduleFilter: "string?" },
          output: "object[]"
        },
        getLastReport: {
          description: "Return the most recent full test report.",
          input:  {},
          output: "object"
        }
      },
      events: {
        "testcore:runStarted": {
          payload: { suiteCount: "number", moduleCount: "number", runId: "string" }
        },
        "testcore:suiteCompleted": {
          payload: { suiteId: "string", moduleId: "string", passed: "number", failed: "number", durationMs: "number" }
        },
        "testcore:runCompleted": {
          payload: { runId: "string", passed: "number", failed: "number", total: "number", durationMs: "number" }
        },
        "testcore:failureDetected": {
          payload: { suiteId: "string", moduleId: "string", assertion: "object", actual: "object" }
        },
        "testcore:coachDispatched": {
          payload: { suiteId: "string", moduleId: "string", failureCount: "number" }
        }
      },
      accepts: {
        "registry:moduleRegistered": {
          description: "Triggers a re-run of the registered module's suite if one exists."
        },
        "diff:accepted": {
          description: "Triggers a re-run of suites for the module that was just patched by Coach."
        }
      },
      slots: {}
    },

    docs: {
      description: "SDOA self-healing test runner. Auto-discovers *.tests.json assertion suites declared in module MANIFESTs via optimization.assertionSuite. Runs each suite against live module commands via the EventBus, collects results, and pipes failures to Coach.workflow.py with the full context needed to synthesize a fix. Completes the Phase 3 cognitive loop: detect → fix → validate → hot-swap → re-test.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.0.0"
    }
  };

  // ── Private State ─────────────────────────────────────────────
  _oracle      = null;
  _chronicle   = null;
  _coach       = null;
  _registry    = null;
  _lastReport  = null;
  _runSeq      = 0;
  _busUnsub    = [];

  // ── Lifecycle ──────────────────────────────────────────────────

  async init(registry) {
    this._registry  = registry;
    this._oracle    = registry.get("Oracle.service");
    this._chronicle = registry.get("Chronicle.service");

    // Wire EventBus triggers
    const bus = registry.get("EventBus.service");
    if (bus) {
      const onRegistered = async (payload) => {
        const moduleId = payload?.moduleId ?? payload?.id;
        if (!moduleId) return;
        const suites = this._discoverSuites(moduleId);
        if (suites.length) await this.run({ moduleFilter: moduleId, notifyCoach: true });
      };
      const onDiffAccepted = async ({ filename }) => {
        if (!filename) return;
        // Derive moduleId from filename e.g. "Oracle.service.js" → "Oracle.service"
        const moduleId = path.basename(filename, ".js");
        const suites   = this._discoverSuites(moduleId);
        if (suites.length) await this.run({ moduleFilter: moduleId, notifyCoach: true });
      };

      bus.on("registry:moduleRegistered", onRegistered);
      bus.on("diff:accepted",             onDiffAccepted);
      this._busUnsub.push(
        () => bus.off?.("registry:moduleRegistered", onRegistered),
        () => bus.off?.("diff:accepted",             onDiffAccepted)
      );
    }
  }

  async run(payload) {
    const {
      moduleFilter = null,
      failFast     = false,
      notifyCoach  = true,
      dryRun       = false
    } = payload ?? {};

    const runId    = `run-${++this._runSeq}-${Date.now()}`;
    const t0       = Date.now();
    const suites   = this._discoverSuites(moduleFilter);

    this._emit("testcore:runStarted", {
      suiteCount:  suites.length,
      moduleCount: new Set(suites.map(s => s.moduleId)).size,
      runId
    });

    if (dryRun) {
      return ResponseFormatter.ok({ runId, suites, dryRun: true });
    }

    const results   = [];
    let totalPassed = 0;
    let totalFailed = 0;

    for (const suite of suites) {
      const result = await this._runSuite(suite, notifyCoach);
      results.push(result);
      totalPassed += result.passed;
      totalFailed += result.failed;

      this._emit("testcore:suiteCompleted", {
        suiteId: suite.suiteId, moduleId: suite.moduleId,
        passed: result.passed, failed: result.failed, durationMs: result.durationMs
      });

      if (failFast && totalFailed > 0) break;
    }

    const durationMs = Date.now() - t0;
    const report = {
      runId, suiteCount: suites.length, totalPassed, totalFailed,
      total: totalPassed + totalFailed, durationMs,
      passRate: totalPassed + totalFailed > 0
        ? Math.round((totalPassed / (totalPassed + totalFailed)) * 100)
        : 100,
      results, completedAt: new Date().toISOString()
    };

    this._lastReport = report;

    this._emit("testcore:runCompleted", {
      runId, passed: totalPassed, failed: totalFailed,
      total: report.total, durationMs
    });

    this._chronicle?.record({
      type: "testcore:runCompleted", source: "TestCore.workflow",
      payload: { runId, passed: totalPassed, failed: totalFailed, total: report.total }
    });

    return ResponseFormatter.ok({ report });
  }

  async runSuite({ suitePath, moduleId = null, notifyCoach = true } = {}) {
    const suite = this._loadSuiteFile(suitePath, moduleId ?? path.basename(suitePath, ".tests.json"));
    if (!suite) return ResponseFormatter.fail(`TestCore: Suite not found at "${suitePath}"`);
    const result = await this._runSuite(suite, notifyCoach);
    return ResponseFormatter.ok({ result });
  }

  listSuites({ moduleFilter } = {}) {
    return ResponseFormatter.ok({ suites: this._discoverSuites(moduleFilter) });
  }

  getLastReport() {
    return ResponseFormatter.ok({ report: this._lastReport });
  }

  // ── Suite Discovery ────────────────────────────────────────────

  /**
   * _discoverSuites(moduleFilter?)
   *
   * Walks Oracle's full surface, finds modules with
   * MANIFEST.optimization.assertionSuite declared, and loads each suite file.
   *
   * Suite files are *.tests.json — each is an array of TestCase objects.
   */
  _discoverSuites(moduleFilter = null) {
    const surface  = this._oracle?.dumpSurface({}) ?? [];
    const seen     = new Set();
    const suites   = [];

    for (const entry of surface) {
      const moduleId = entry.moduleId;
      if (seen.has(moduleId)) continue;
      if (moduleFilter && !moduleId.includes(moduleFilter)) continue;
      seen.add(moduleId);

      // Check if this module declares an assertion suite
      const manifest = this._oracle?.describeModule({ moduleId })?.manifest
                    ?? this._oracle?.describeModule({ moduleId });
      const suitePath = manifest?.optimization?.assertionSuite
                     ?? this._inferSuitePath(moduleId);

      if (!suitePath) continue;

      const suite = this._loadSuiteFile(suitePath, moduleId);
      if (suite) suites.push(suite);
    }

    return suites;
  }

  _inferSuitePath(moduleId) {
    // Conventional path: server/data/tests/<moduleId>.tests.json
    const conventional = path.join(
      process.env.SDOA_PORTFOLIO_ROOT ?? "./",
      "../server/data/tests",
      `${moduleId}.tests.json`
    );
    return fs.existsSync(conventional) ? conventional : null;
  }

  _loadSuiteFile(suitePath, moduleId) {
    try {
      const raw   = fs.readFileSync(suitePath, "utf8");
      const cases = JSON.parse(raw);
      if (!Array.isArray(cases)) return null;
      return {
        suiteId:  `suite::${moduleId}`,
        moduleId,
        suitePath,
        cases
      };
    } catch {
      return null;
    }
  }

  // ── Suite Execution ────────────────────────────────────────────

  /**
   * _runSuite(suite, notifyCoach) → SuiteResult
   *
   * TestCase shape (*.tests.json):
   * {
   *   "id":        "test-001",
   *   "command":   "record",
   *   "input":     { "type": "event:test", "payload": {}, "source": "TestCore" },
   *   "assert": [
   *     { "path": "id",    "op": "notNull" },
   *     { "path": "prevHash", "op": "type", "expected": "string" }
   *   ],
   *   "description": "record() returns a hash-linked entry"
   * }
   */
  async _runSuite(suite, notifyCoach) {
    const t0         = Date.now();
    const failures   = [];
    let passed       = 0;

    for (const testCase of suite.cases) {
      const result = await this._runCase(suite.moduleId, testCase);
      if (result.pass) {
        passed++;
      } else {
        failures.push(result);
        this._emit("testcore:failureDetected", {
          suiteId:   suite.suiteId,
          moduleId:  suite.moduleId,
          assertion: result.failedAssertion,
          actual:    result.actual
        });
      }
    }

    // Pipe failures to Coach
    if (failures.length > 0 && notifyCoach) {
      await this._notifyCoach(suite, failures);
    }

    return {
      suiteId:   suite.suiteId,
      moduleId:  suite.moduleId,
      passed,
      failed:    failures.length,
      total:     suite.cases.length,
      failures,
      durationMs: Date.now() - t0
    };
  }

  async _runCase(moduleId, testCase) {
    let actual;
    try {
      const bus = this._registry?.get?.("EventBus.service");
      if (bus?.commandAsync) {
        actual = await bus.commandAsync(moduleId, testCase.command, testCase.input ?? {});
      } else {
        // Fallback: direct registry invocation
        const mod = this._registry?.get?.(moduleId);
        if (!mod?.[testCase.command]) {
          return { pass: false, caseId: testCase.id,
            failedAssertion: { path: "_invoke", op: "notNull" },
            actual: null, error: `Command "${testCase.command}" not found on ${moduleId}` };
        }
        actual = await mod[testCase.command](testCase.input ?? {});
      }
    } catch (err) {
      return { pass: false, caseId: testCase.id,
        failedAssertion: { path: "_invoke", op: "noThrow" },
        actual: null, error: err.message };
    }

    // Run assertions
    for (const assertion of (testCase.assert ?? [])) {
      const { path: assertPath, op, expected } = assertion;
      const value = assertPath ? this._getPath(actual, assertPath) : actual;
      const fn    = OPERATORS[op];
      if (!fn) continue;
      const pass  = fn(value, expected);
      if (!pass) {
        return {
          pass: false, caseId: testCase.id,
          description: testCase.description,
          failedAssertion: assertion,
          actual: { fullResult: actual, resolvedPath: value }
        };
      }
    }

    return { pass: true, caseId: testCase.id };
  }

  // ── Coach Notification ─────────────────────────────────────────

  /**
   * _notifyCoach(suite, failures)
   *
   * Formats a failure payload matching the Phase 3 spec:
   * [Failing Expression, Expected Value, Actual Value,
   *  Target Module Source, Target Module MANIFEST]
   * Dispatches to Coach.workflow.py via the Router.
   */
  async _notifyCoach(suite, failures) {
    this._coach = this._coach ?? this._registry?.get?.("Coach.workflow");

    const moduleSource   = this._readModuleSource(suite.moduleId);
    const moduleManifest = this._oracle?.describeModule({ moduleId: suite.moduleId }) ?? null;

    const coachPayload = {
      moduleId:       suite.moduleId,
      suiteId:        suite.suiteId,
      failureCount:   failures.length,
      failures:       failures.map(f => ({
        caseId:           f.caseId,
        description:      f.description ?? "",
        failingExpression: `${f.failedAssertion?.path} ${f.failedAssertion?.op} ${f.failedAssertion?.expected ?? ""}`.trim(),
        expectedValue:    f.failedAssertion?.expected ?? null,
        actualValue:      f.actual?.resolvedPath ?? f.actual ?? null,
        error:            f.error ?? null
      })),
      moduleSource,
      moduleManifest,
      instruction: `Identify the bug in ${suite.moduleId}, modify the function body only, increment manifest.version patch, return only the rewritten file.`
    };

    try {
      if (this._coach?.run) {
        await this._coach.run(coachPayload);
      } else {
        // Emit for Coach to pick up via EventBus if not directly available
        this._emit("coach:repairRequested", coachPayload);
      }

      this._emit("testcore:coachDispatched", {
        suiteId:      suite.suiteId,
        moduleId:     suite.moduleId,
        failureCount: failures.length
      });

      this._chronicle?.record({
        type:    "testcore:coachDispatched",
        source:  "TestCore.workflow",
        payload: { moduleId: suite.moduleId, failureCount: failures.length }
      });
    } catch (err) {
      // Coach unavailable — log but don't fail the test run
      this._chronicle?.record({
        type:    "testcore:coachUnavailable",
        source:  "TestCore.workflow",
        payload: { moduleId: suite.moduleId, error: err.message }
      });
    }
  }

  _readModuleSource(moduleId) {
    // Attempt to read the source file from the portfolio
    const candidates = [
      path.join(process.env.SDOA_PORTFOLIO_ROOT ?? "./portfolio", `${moduleId}.js`),
      path.join(process.env.SDOA_PORTFOLIO_ROOT ?? "./portfolio", `${moduleId}.py`),
      path.join(process.env.SDOA_PORTFOLIO_ROOT ?? "./portfolio", `${moduleId}.rs`)
    ];
    for (const p of candidates) {
      try { return fs.readFileSync(p, "utf8"); } catch { continue; }
    }
    return null;
  }

  // ── Path Utility ───────────────────────────────────────────────

  _getPath(obj, dotPath) {
    return dotPath.replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .reduce((acc, k) => (acc != null ? acc[k] : undefined), obj);
  }

  // ── Helpers ────────────────────────────────────────────────────

  _emit(eventName, payload) {
    try {
      const bus = this._registry?.get?.("EventBus.service");
      bus?.emit?.(eventName, payload);
    } catch (_) {}
  }

  async dispose() {
    this._busUnsub.forEach(fn => fn());
    this._busUnsub = [];
    this._oracle    = null;
    this._chronicle = null;
    this._coach     = null;
  }
}

module.exports = TestCoreWorkflow;
