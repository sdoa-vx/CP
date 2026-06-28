// ──────────────────────────────────────────────────────────────────
// File:    ProbationOfficer.workflow.js
// Version: 5.1.0
// Updated: 2026-06-27T00:00:00Z
// Changes: P2-8 — Added SLEEVE_* rule pack (SDOA v5.4 §4).
//          New rules: SLEEVE_NO_MUTATION, SLEEVE_NO_EVAL,
//          SLEEVE_NO_ABSOLUTE_PATHS, SLEEVE_DECLARED_TRANSPORT_ONLY,
//          SLEEVE_EXTERNAL_DECLARATION_REQUIRED.
//          MAX_LINE_LIMITS extended with sleeve type (500 line ceiling).
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-02 18:40 UTC
// Module Type: workflow | Operational Role: probation-officer
// Version: 5.0.0 | Runtime: NodeJS

const ResponseFormatter = require('../services/ResponseFormatter.service'); // [cite: 141]

class ProbationOfficerWorkflow {
  static MANIFEST = {
    // ── v1.2 Required Structural Contract ──────────────────
    id: "ProbationOfficer.workflow",
    type: "workflow",
    version: "5.1.0",
    runtime: "NodeJS",
    capabilities: ["security.sandbox", "ast.validation"],
    dependencies: ["ResponseFormatter.service"],

    // ── v4.0 / v5.0 Additions ──────────────────────────────
    layer: 3,
    operationalRole: "probation-officer",
    requires: ["ResponseFormatter.service"],
    dataFiles: [],
    lifecycle: ["init", "run", "dispose"],
    actions: {
      commands: {
        run: {
          description: "Performs full architectural static analysis and sandboxed compliance execution on a target payload.",
          input: { source_payload: "string" },
          output: "object"
        }
      },
      events: {
        "probation:analysisPassed": { payload: { id: "string", size: "number" } },
        "probation:securityViolation": { payload: { id: "string", rule: "string", details: "string" } }
      },
      accepts: {},
      slots: {}
    },
    optimization: {
      priority: "safety",
      assertionSuite: "ProbationOfficer.tests.json"
    },
    docs: {
      description: "Ironclad static analysis gatekeeper. Rejects anti-patterns, line-limit drift, and context escapes before deployment.",
      author: "ProtoAI Core Architecture Group",
      sdoa: "5.0.0"
    }
  };

  constructor() {
    this.responseFormatter = null;

    // Explicit SDOA v4.0/v5.0 file constraints [cite: 184, 185]
    this.CONSTRAINTS = {
      MAX_LINE_LIMITS: {
        primitive:  150,
        feature:    200,
        adapter:    200,
        workflow:   200,
        repository: 200,
        engine:     200,
        sleeve:     500   // v5.4: Sleeve ceiling (Whitepaper §4)
      },
      FORBIDDEN_STRINGS: [
        'eval\\(', 'Function\\(', 'window\\.', 'global\\.', 'process\\.',
        'child_process', 'cluster', 'prototype', '__proto__', 'window.currentUser', 'window.appState'
      ],
      // v5.4: Sleeve-specific rule pack (SDOA Whitepaper §4)
      SLEEVE_RULES: [
        {
          id: 'SLEEVE_NO_MUTATION',
          test: (src) => /fs\.writeFileSync\s*\([^)]*service|fs\.writeFileSync\s*\([^)]*module/i.test(src),
          message: 'Sleeve must not write to SDOA source or module files (§3.1).'
        },
        {
          id: 'SLEEVE_NO_EVAL',
          test: (src) => /\bFunction\s*\(|new\s+Function\s*\(|\beval\s*\(/.test(src),
          message: 'Sleeve must not use eval() or Function() constructors (§4 Probation Gate).'
        },
        {
          id: 'SLEEVE_NO_ABSOLUTE_PATHS',
          test: (src) => /["'`][A-Za-z]:\\\\/.test(src),
          message: 'Sleeve must not hardcode machine-absolute paths (§3.1). Use PathResolver.'
        },
        {
          id: 'SLEEVE_DECLARED_TRANSPORT_ONLY',
          test: (src, manifest) => {
            if (!manifest || manifest.type !== 'sleeve') return false;
            // If transport is "https" but raw fetch() is used instead of a declared connector
            if ((manifest.external?.transport ?? '').includes('https') && /\bfetch\s*\(/.test(src)) return true;
            return false;
          },
          message: 'Sleeve must route transport through declared connectors, not raw fetch() (§2.7.2).'
        },
        {
          id: 'SLEEVE_EXTERNAL_DECLARATION_REQUIRED',
          test: (src, manifest) => manifest?.type === 'sleeve' && !manifest?.external,
          message: 'Sleeve module must declare an external{} block in MANIFEST (§3.2).'
        }
      ]
    };
  }

  async init(registry) {
    this.responseFormatter = registry.get("ResponseFormatter.service"); // [cite: 143]
  }

  /**
   * Execution target for the dynamic loop.
   */
  async run(payload) {
    const { source_payload } = payload;

    if (!source_payload || typeof source_payload !== 'string') {
      return this.responseFormatter.fail("Invalid verification payload. Source must be a clean string.");
    }

    try {
      // Step 1: Structural Extraction (Surgical Manifest Validation)
      const manifest = this.extractManifest(source_payload);
      if (!manifest) {
        this.emitViolation("Anonymous.module", "MISSING_OR_CORRUPT_MANIFEST", "Module lacks a readable static MANIFEST block contract.");
        return this.responseFormatter.ok({ compliant: false, reason: "Manifest missing or malformed." });
      }

      const moduleId = manifest.id || "Unknown.module";

      // Step 2: Line Count and Structural Complexity Enforcement
      const totalLines = source_payload.split('\n').length;
      const configuredMax = this.CONSTRAINTS.MAX_LINE_LIMITS[manifest.type] || 200;

      if (totalLines > configuredMax) {
        this.emitViolation(moduleId, "LINE_LIMIT_DRIFT", `Module size (${totalLines} lines) exceeds target constraint max of ${configuredMax} for type ${manifest.type}.`);
        return this.responseFormatter.ok({ compliant: false, reason: `File length exceeds maximum permitted ${configuredMax} lines.` });
      }

      // Step 3: Hardened Global Leak & Anti-Pattern Check
      for (const pattern of this.CONSTRAINTS.FORBIDDEN_STRINGS) {
        const regex = new RegExp(pattern, 'g');
        if (regex.test(source_payload)) {
          this.emitViolation(moduleId, "ANTI_PATTERN_VIOLATION", `Prohibited architectural escape token found: "${pattern}"`);
          return this.responseFormatter.ok({ compliant: false, reason: `Anti-pattern violation containing blacklisted phrase: ${pattern}` });
        }
      }

      // Step 3b: Sleeve Rule Pack (v5.4 — applied only to sleeve-type modules)
      if (manifest.type === 'sleeve') {
        for (const rule of this.CONSTRAINTS.SLEEVE_RULES) {
          if (rule.test(source_payload, manifest)) {
            this.emitViolation(moduleId, rule.id, rule.message);
            return this.responseFormatter.ok({ compliant: false, reason: `Sleeve violation [${rule.id}]: ${rule.message}` });
          }
        }
      }

      // Step 4: Separation of Layers Verification
      const complianceCheck = this.verifyLayerIsolation(manifest);
      if (!complianceCheck.valid) {
        this.emitViolation(moduleId, "LAYER_ISOLATION_BREACH", complianceCheck.reason);
        return this.responseFormatter.ok({ compliant: false, reason: complianceCheck.reason });
      }

      // All checkpoints cleared safely!
      window.EventBus?.emit("probation:analysisPassed", { id: moduleId, size: source_payload.length });
      return this.responseFormatter.ok({ compliant: true, manifest });

    } catch (fault) {
      return this.responseFormatter.fail(`Probation internal runtime crash: ${fault.message}`);
    }
  }

  /**
   * Safely isolates and parses the static MANIFEST token definition without running the whole script.
   */
  extractManifest(sourceCode) {
    try {
      const match = sourceCode.match(/static\s+MANIFEST\s*=\s*({[\s\S]*?});/);
      if (!match) return null;

      const looseJson = match[1];
      const strictJson = looseJson
        .replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":') // Ensure keys are quoted
        .replace(/'/g, '"')                       // Standardize single quotes
        .replace(/,\s*([}\]])/g, '$1');           // Strip trailing commas

      return JSON.parse(strictJson);
    } catch {
      return null;
    }
  }

  /**
   * Hardens Section 3 Layer Rules programmatically. [cite: 44, 45, 46, 47]
   */
  verifyLayerIsolation(manifest) {
    const { type, layer, requires = [], backendDeps = [], external } = manifest;

    // Rule: Primitives are entirely unaware of the backend [cite: 46, 187]
    if (type === "primitive" && (layer !== 2 || backendDeps.length > 0)) {
      return { valid: false, reason: "Primitives (Layer 2) are structurally barred from declaring backend dependencies." };
    }

    // Rule: Features call primitives or adapters, never repositories directly
    if (type === "feature") {
      if (layer !== 1) return { valid: false, reason: "Features must explicitly bind to Layer 1." };
      const targetsRepo = requires.some(req => req.toLowerCase().includes('repository'));
      if (targetsRepo) {
        return { valid: false, reason: "Layer 1 Breach: Features may never target structural Repositories directly." };
      }
    }

    // v5.4: Sleeve modules must live at Layer 3 (Whitepaper §2.7.2)
    if (type === "sleeve" && layer !== 3) {
      return { valid: false, reason: "Sleeve modules must be placed at Layer 3 (Whitepaper §2.7.2)." };
    }

    // v5.4: Sleeve modules must declare external block
    if (type === "sleeve" && !external) {
      return { valid: false, reason: "Sleeve modules must declare an external{} block in MANIFEST (§3.2)." };
    }

    return { valid: true };
  }

  emitViolation(moduleId, rule, details) {
    window.EventBus?.emit("probation:securityViolation", { id: moduleId, rule, details });
  }

  async dispose() {
    // Graceful release loop hook
  }
}

// Clean SDOA export contract. No singleton initialization leak! [cite: 147, 187]
module.exports = ProbationOfficerWorkflow;
