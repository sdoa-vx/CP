// ──────────────────────────────────────────────────────────────────
// File:    Scaffold.workflow.js
// Version: 5.1.0
// Updated: 2026-06-27T00:00:00Z
// Changes: Added "sleeve" module type (SDOA v5.4).
//          _stubGenerate() emits full external: {} block for sleeves.
//          _staticValidate() checks for external block on sleeve type.
//          DEFAULT_TEMPLATES includes sleeve entry (500-line ceiling).
//          MANIFEST_SKELETON and SCAFFOLD_SYSTEM_PROMPT updated.
// ──────────────────────────────────────────────────────────────────
// Scaffold.workflow.js — SDOA v5.0 Workflow (NodeJS)
// Validated by: ProbationOfficer.workflow.rs
//
// Change log:
//   5.0.0 — Initial implementation. AI-powered SDOA module generator.
//            Coach.workflow.py repairs existing modules.
//            Scaffold generates net-new ones from a plain-text description.
//
//            Pipeline:
//              1. Build a rich SDOA spec prompt from the description + type hints
//              2. Send to LLM (AiProvider.adapter) with the full v5.0 schema
//              3. Extract the generated source file from the response
//              4. Run static pre-validation (MANIFEST field checks)
//              5. Route through ProbationOfficer for sandbox execution
//              6. If approved, write to /portfolio with a 5.0.0 version stamp
//              7. Emit scaffold:moduleGenerated → Registrar hot-swaps on next tick

"use strict";

const fs   = require("fs");
const path = require("path");
const ResponseFormatter = require("../services/ResponseFormatter.service");

class ScaffoldWorkflow {
  static MANIFEST = {
    // ── Identity ──────────────────────────────
    id:              "Scaffold.workflow",
    type:            "workflow",
    layer:           3,
    runtime:         "NodeJS",
    version:         "5.1.1",
    last_modified:   "2026-07-13T00:00:00Z",
    operationalRole: "savant",
    capabilities: ["scaffold:generate", "scaffold:preview", "scaffold:list-templates"],

    // ── Dependencies ──────────────────────────
    requires:  [
      "Oracle.service",
      "Chronicle.service",
      "ResponseFormatter.service"
      // ProbationOfficer.workflow.rs — resolved lazily (Rust/Wasm, may not be present in dev)
      // AiProvider.adapter           — resolved lazily
    ],
    dependencies: ["Oracle.service", "Chronicle.service", "ResponseFormatter.service"],
    dataFiles: ["server/data/scaffold.templates.json"],

    // ── Lifecycle ─────────────────────────────
    lifecycle: ["init", "run", "dispose"],

    // ── Action Surface ────────────────────────
    actions: {
      commands: {
        run: {
          description: "Generate a complete SDOA v5.4 module from a plain-text description. Validates through ProbationOfficer before writing to /portfolio.",
          input: {
            description:  "string",    // What the module should do
            moduleType:   "string?",   // primitive | feature | adapter | service | workflow | repository | sleeve (default: workflow)
            runtime:      "string?",   // Browser | NodeJS | Universal | Rust | Python (default: NodeJS)
            moduleId:     "string?",   // Desired id e.g. "DataSync.workflow" or "MyApi.module" for sleeves
            layer:        "number?",   // 1 | 2 | 3 (inferred from type if omitted)
            skipProbe:    "boolean?",  // Skip ProbationOfficer sandbox (dev/testing only)
            outputPath:   "string?",   // Override write path (default: portfolio/)
            // Sleeve-specific (only used when moduleType = "sleeve")
            externalSystem:    "string?",  // e.g. "my-api"
            externalTransport: "string?",  // https | node-module | http+spawn | polyglot-bridge | window.__TAURI__
            externalCommands:  "string[]?" // e.g. ["complete", "stream"]
          },
          output: "object"
          // { moduleId, filename, path, source, probationResult, registered }
        },
        preview: {
          description: "Generate a module but do not write to disk or run ProbationOfficer. Returns the raw source for inspection.",
          input: {
            description: "string",
            moduleType:  "string?",
            runtime:     "string?",
            moduleId:    "string?"
          },
          output: "object"
          // { moduleId, filename, source }
        },
        listTemplates: {
          description: "Return all available scaffold template profiles loaded from scaffold.templates.json.",
          input:  {},
          output: "object[]"
        }
      },
      events: {
        "scaffold:generating": {
          payload: { description: "string", moduleType: "string", runtime: "string" }
        },
        "scaffold:moduleGenerated": {
          payload: { moduleId: "string", filename: "string", portfolioPath: "string", probationPassed: "boolean" }
        },
        "scaffold:probationFailed": {
          payload: { moduleId: "string", filename: "string", errors: "string[]" }
        },
        "scaffold:failed": {
          payload: { description: "string", reason: "string" }
        }
      },
      accepts: {},
      slots:   {}
    },

    docs: {
      description: "AI-powered SDOA v5.0 module generator. Builds a complete, spec-compliant source file from a plain-text description — MANIFEST block, lifecycle methods, action surface, and documentation. Every generated file passes through ProbationOfficer's sandbox before landing in the portfolio. Coach repairs existing modules; Scaffold creates new ones.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.0.0"
    }
  };

  // ── Private State ─────────────────────────────────────────────
  _oracle      = null;
  _chronicle   = null;
  _probation   = null;
  _llm         = null;
  _registry    = null;
  _templates   = [];
  _portfolioRoot = "./portfolio";

  // ── Lifecycle ──────────────────────────────────────────────────

  async init(registry) {
    this._registry     = registry;
    this._oracle       = registry.get("Oracle.service");
    this._chronicle    = registry.get("Chronicle.service");
    this._portfolioRoot = process.env.SDOA_PORTFOLIO_ROOT ?? "./portfolio";

    // Load template profiles (non-fatal if missing)
    try {
      const raw = fs.readFileSync(
        path.join(__dirname, "../data/scaffold.templates.json"), "utf8"
      );
      this._templates = JSON.parse(raw);
    } catch (_) {
      this._templates = DEFAULT_TEMPLATES;
    }
  }

  async run(payload) {
    const {
      description,
      moduleType         = "workflow",
      runtime            = this._defaultRuntime(moduleType),
      moduleId           = null,
      layer              = this._defaultLayer(moduleType),
      skipProbe          = false,
      outputPath         = null,
      externalSystem     = null,
      externalTransport  = "https",
      externalCommands   = []
    } = payload ?? {};

    if (!description?.trim()) {
      return ResponseFormatter.fail("Scaffold: `description` is required.");
    }

    this._emit("scaffold:generating", { description, moduleType, runtime });

    // ── 1. Resolve LLM ──────────────────────
    this._llm      = this._llm ?? this._registry?.get?.("AiProvider.adapter");
    this._probation = this._probation ?? this._registry?.get?.("ProbationOfficer.workflow");

    // ── 2. Infer module ID if not supplied ──
    const resolvedId = moduleId ?? this._inferModuleId(description, moduleType);
    const filename   = `${resolvedId}.js`;
    const dest       = path.join(outputPath ?? this._portfolioRoot, filename);

    // ── 3. Generate source ───────────────────
    let source;
    try {
      source = await this._generate({ description, moduleType, runtime, layer, moduleId: resolvedId, externalSystem, externalTransport, externalCommands });
    } catch (err) {
      this._emit("scaffold:failed", { description, reason: err.message });
      return ResponseFormatter.fail(`Scaffold: Generation failed — ${err.message}`);
    }

    // ── 4. Static pre-validation ────────────
    const staticErrors = this._staticValidate(source, resolvedId, moduleType);
    if (staticErrors.length > 0) {
      // Attempt one self-correction pass
      try {
        source = await this._correct(source, staticErrors, { description, moduleType, runtime, layer, moduleId: resolvedId });
        const retryErrors = this._staticValidate(source, resolvedId, moduleType);
        if (retryErrors.length > 0) {
          this._emit("scaffold:probationFailed", { moduleId: resolvedId, filename, errors: retryErrors });
          return ResponseFormatter.fail(`Scaffold: Static validation failed after correction — ${retryErrors.join("; ")}`);
        }
      } catch (err) {
        this._emit("scaffold:failed", { description, reason: `Correction pass failed: ${err.message}` });
        return ResponseFormatter.fail(`Scaffold: Could not correct static errors — ${err.message}`);
      }
    }

    // ── 5. ProbationOfficer sandbox ─────────
    let probationResult = { passed: true, errors: [] };
    if (!skipProbe && this._probation) {
      try {
        probationResult = await this._probation.run({ source, filename, moduleId: resolvedId });
      } catch (err) {
        probationResult = { passed: false, errors: [err.message] };
      }

      if (!probationResult.passed) {
        this._emit("scaffold:probationFailed", {
          moduleId: resolvedId, filename, errors: probationResult.errors
        });
        this._chronicle?.record({
          type:    "scaffold:probationFailed",
          source:  "Scaffold.workflow",
          payload: { moduleId: resolvedId, filename, errors: probationResult.errors }
        });
        return ResponseFormatter.fail(
          `Scaffold: ProbationOfficer rejected "${filename}" — ${probationResult.errors.join("; ")}`
        );
      }
    }

    // ── 6. Write to portfolio ────────────────
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, source, "utf8");
    } catch (err) {
      return ResponseFormatter.fail(`Scaffold: Could not write "${dest}" — ${err.message}`);
    }

    // ── 7. Chronicle + notify ────────────────
    this._chronicle?.record({
      type:    "scaffold:moduleGenerated",
      source:  "Scaffold.workflow",
      payload: { moduleId: resolvedId, filename, dest, probationPassed: probationResult.passed }
    });

    this._emit("scaffold:moduleGenerated", {
      moduleId:       resolvedId,
      filename,
      portfolioPath:  dest,
      probationPassed: probationResult.passed
    });

    // Notify Registrar so it can hot-swap
    this._emit("registry:moduleGenerated", { portfolioPath: dest });

    return ResponseFormatter.ok({
      moduleId:       resolvedId,
      filename,
      path:           dest,
      source,
      probationResult,
      registered:     false  // Registrar handles this asynchronously
    });
  }

  // preview — generate without writing
  async preview(payload) {
    const {
      description,
      moduleType = "workflow",
      runtime    = this._defaultRuntime(moduleType),
      moduleId   = null
    } = payload ?? {};

    if (!description?.trim()) {
      return ResponseFormatter.fail("Scaffold: `description` is required.");
    }

    const resolvedId = moduleId ?? this._inferModuleId(description, moduleType);
    const layer      = this._defaultLayer(moduleType);

    const source = await this._generate({
      description, moduleType, runtime, layer, moduleId: resolvedId
    });

    return ResponseFormatter.ok({ moduleId: resolvedId, filename: `${resolvedId}.js`, source });
  }

  listTemplates() {
    return ResponseFormatter.ok({ templates: this._templates });
  }

  // ── Generation Engine ──────────────────────────────────────────

  async _generate({ description, moduleType, runtime, layer, moduleId, externalSystem, externalTransport, externalCommands }) {
    const template = this._templates.find(t => t.type === moduleType) ?? DEFAULT_TEMPLATES[0];
    const prompt   = this._buildPrompt({ description, moduleType, runtime, layer, moduleId, template, externalSystem, externalTransport, externalCommands });

    let raw;
    if (this._llm?.complete) {
      raw = await this._llm.complete({
        system: SCAFFOLD_SYSTEM_PROMPT,
        prompt,
        format: "text"
      });
    } else {
      // Fallback: emit a well-formed stub without LLM
      raw = this._stubGenerate({ description, moduleType, runtime, layer, moduleId, template, externalSystem, externalTransport, externalCommands });
    }

    return this._extractSource(raw);
  }

  async _correct(source, errors, spec) {
    const prompt = [
      "The following SDOA v5.0 module has static validation errors:",
      "",
      "ERRORS:",
      errors.map(e => `  - ${e}`).join("\n"),
      "",
      "SOURCE TO CORRECT:",
      "```javascript",
      source,
      "```",
      "",
      "Return the corrected complete source file. Fix only the listed errors. Do not change any other logic."
    ].join("\n");

    const raw = await this._llm.complete({
      system: SCAFFOLD_SYSTEM_PROMPT,
      prompt,
      format: "text"
    });

    return this._extractSource(raw);
  }

  _buildPrompt({ description, moduleType, runtime, layer, moduleId, template, externalSystem, externalTransport, externalCommands }) {
    const now = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

    // Gather existing module IDs from Oracle for the requires field hints
    const existingIds = this._oracle
      ? this._oracle.dumpSurface({}).map(e => e.moduleId).filter((v, i, a) => a.indexOf(v) === i)
      : [];

    return [
      `Generate a complete SDOA v5.0 ${moduleType} module in ${runtime}.`,
      "",
      "DESCRIPTION:",
      description,
      "",
      `MODULE ID:    ${moduleId}`,
      `TYPE:         ${moduleType}`,
      `LAYER:        ${layer}`,
      `RUNTIME:      ${runtime}`,
      `TIMESTAMP:    ${now}`,
      "",
      "REQUIREMENTS:",
      "  1. Begin with: // Last modified: " + now,
      `  2. Include a complete static MANIFEST = { ... } block with all v5.0 fields.`,
      "  3. Implement the full lifecycle: " + template.lifecycle.join(", "),
      "  4. Populate actions.commands, actions.events, actions.accepts based on the description.",
      "  5. All docs.description fields must be non-empty strings.",
      "  6. version must be exactly \"5.0.0\".",
      "  7. operationalRole must be \"savant\" unless the module is a system sovereign.",
      "  8. File size must not exceed " + template.lineLimit + " lines.",
      "  9. No hard-coded state reads from window.* — use StateStore.",
      "  10. No manual switch statements — use manifest-driven routing.",
      ...(moduleType === "sleeve" ? [
        "",
        "SLEEVE-SPECIFIC RULES (type = \"sleeve\"):",
        "  S1. MUST include external: { system, transport, path, commands[] } in MANIFEST.",
        "  S2. NEVER call fs.writeFileSync on a peer module file.",
        "  S3. NEVER use eval() or Function() constructors.",
        "  S4. NEVER hardcode absolute paths — use PathResolver.service.",
        "  S5. All output MUST pass through ResponseFormatter.service.",
        "  S6. requires[] MUST include ResponseFormatter.service and PathResolver.service.",
        `  S7. external.system = "${externalSystem ?? "your-system"}"`,
        `  S8. external.transport = "${externalTransport ?? "https"}"`,
        `  S9. external.commands = ${JSON.stringify(externalCommands?.length ? externalCommands : ["run"])}`,
        "  S10. File must stay under 500 lines."
      ] : []),
      "",
      "AVAILABLE MODULES TO REFERENCE IN requires[]:",
      existingIds.slice(0, 30).map(id => `  - ${id}`).join("\n"),
      "",
      "MANIFEST SKELETON (v5.0):",
      MANIFEST_SKELETON,
      "",
      "FULL SOURCE EXAMPLE:",
      template.example,
      "",
      "Return ONLY the complete source file. No explanation. No markdown outside code fences."
    ].join("\n");
  }

  // ── Stub Generator (no-LLM fallback) ──────────────────────────

  _stubGenerate({ description, moduleType, runtime, layer, moduleId, template, externalSystem, externalTransport, externalCommands }) {
    const now    = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
    const isNode = runtime === "NodeJS";

    const classBody = template.lifecycle.map(phase => {
      const args = {
        init:    isNode ? "(registry)" : "(config)",
        mount:   "(container)",
        update:  "(newState)",
        unmount: "()",
        destroy: "()",
        run:     "(payload)",
        dispose: "()"
      }[phase] ?? "()";
      return `  async ${phase}${args} {\n    // TODO: implement ${phase}\n  }`;
    }).join("\n\n");

    const exportLine = isNode ? `\nmodule.exports = ${this._toClassName(moduleId)};` : "";
    const wrapOpen   = isNode ? '"use strict";\n\n' : '(function () {\n  "use strict";\n\n';
    const wrapClose  = isNode ? "" : `\n  window.${this._toClassName(moduleId)} = ${this._toClassName(moduleId)};\n})();`;

    return [
      `// Last modified: ${now}`,
      `// ${moduleId} — SDOA v5.0 ${this._capitalize(moduleType)} (${runtime})`,
      `// Scaffolded by Scaffold.workflow.js`,
      `// Description: ${description}`,
      "",
      wrapOpen,
      `class ${this._toClassName(moduleId)} {`,
      "  static MANIFEST = {",
      `    id:              "${moduleId}",`,
      `    type:            "${moduleType}",`,
      `    layer:           ${layer},`,
      `    runtime:         "${runtime}",`,
      `    version:         "${moduleType === "sleeve" ? "1.0.0" : "5.0.0"}",`,
      `    operationalRole: "savant",`,
      ...(moduleType === "sleeve" ? [
        "    requires:  [\"ResponseFormatter.service\", \"PathResolver.service\"],",
        `    external: { system: "${externalSystem ?? "external-system"}", transport: "${externalTransport ?? "https"}", path: "auto", commands: ${JSON.stringify(externalCommands?.length ? externalCommands : ["run"])} },`,
      ] : [
        "    requires:  [],",
      ]),
      "    dataFiles: [],",
      `    lifecycle: ${JSON.stringify(template.lifecycle)},`,
      "    actions: {",
      "      commands: {},",
      "      events:   {},",
      "      accepts:  {},",
      "      slots:    {}",
      "    },",
      "    docs: {",
      `      description: "${description.replace(/"/g, '\\"')}",`,
      '      author: "ProtoAI Core Architecture Group",',
      `      sdoa: "${moduleType === "sleeve" ? "5.4" : "5.0.0"}"`,
      "    }",
      "  };",
      "",
      classBody,
      "}",
      wrapClose,
      exportLine
    ].filter(l => l !== undefined).join("\n");
  }

  // ── Static Validation ──────────────────────────────────────────

  /**
   * _staticValidate(source, moduleId, moduleType) → string[]
   *
   * Quick AST-free checks on the raw source string.
   * Returns a list of error messages — empty means pass.
   */
  _staticValidate(source, moduleId, moduleType) {
    const errors = [];
    if (!source?.trim())                            errors.push("Generated source is empty.");
    if (!source.includes("static MANIFEST"))        errors.push("Missing static MANIFEST block.");
    if (!source.includes(`"${moduleId}"`))          errors.push(`MANIFEST.id "${moduleId}" not found in source.`);
    if (!source.includes(`"${moduleType}"`))        errors.push(`MANIFEST.type "${moduleType}" not found.`);
    if (moduleType !== "sleeve" && !source.includes('"5.0.0"'))
                                                    errors.push('MANIFEST.version "5.0.0" not found.');
    if (!source.includes("description:"))           errors.push("MANIFEST.docs.description missing.");
    if (!source.includes("Last modified:"))         errors.push("Missing // Last modified: timestamp header.");
    if (source.includes("window.currentUser ="))    errors.push("Anti-pattern: direct window.currentUser write detected.");
    if (source.includes("setTimeout("))             errors.push("Anti-pattern: setTimeout detected — use lifecycle init().");
    // v5.4: sleeve must have external block
    if (moduleType === "sleeve" && !source.includes("external:")) {
      errors.push("Sleeve MANIFEST is missing required external: { system, transport, path, commands } block.");
    }
    if (moduleType === "sleeve" && (source.includes("eval(") || source.includes("Function("))) {
      errors.push("Sleeve violation: eval() or Function() detected.");
    }
    const lines = source.split("\n").length;
    const limit = moduleType === "primitive" ? 150 : moduleType === "sleeve" ? 500 : 200;
    if (lines > limit + 50) {
      errors.push(`File is ${lines} lines — exceeds ${limit}-line limit for ${moduleType}.`);
    }
    return errors;
  }

  // ── Source Extraction ──────────────────────────────────────────

  _extractSource(raw) {
    if (!raw) throw new Error("LLM returned empty response.");
    const fenceMatch = raw.match(/```(?:javascript|js)?\n([\s\S]*?)```/);
    if (fenceMatch) return fenceMatch[1].trim();
    // No fence — assume entire response is the source
    return raw.trim();
  }

  // ── Utilities ──────────────────────────────────────────────────

  _inferModuleId(description, type) {
    const words   = description.split(/\s+/).slice(0, 4)
      .map(w => w.replace(/[^a-zA-Z]/g, ""))
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    const suffix  = { primitive: "prim", feature: "feature", adapter: "adapter",
                      service: "service", workflow: "workflow", repository: "repository",
                      sleeve: "sleeve" }[type] ?? type;
    return `${words.join("")}.${suffix}`;
  }

  _defaultRuntime(type) {
    return { primitive: "Browser", feature: "Browser", adapter: "Browser",
             service: "Universal", workflow: "NodeJS", repository: "NodeJS",
             sleeve: "NodeJS" }[type] ?? "NodeJS";
  }

  _defaultLayer(type) {
    return { primitive: 2, feature: 1, adapter: 3, service: 3, workflow: 3, repository: 3,
             sleeve: 3 }[type] ?? 3;
  }

  _toClassName(moduleId) {
    return moduleId.replace(/\.[^.]+$/, "")
      .split(/[._-]/)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join("") + this._capitalize(moduleId.split(".").pop() ?? "");
  }

  _capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  _emit(eventName, payload) {
    try {
      const bus = this._registry?.get?.("EventBus.service");
      bus?.emit?.(eventName, payload);
    } catch (_) {}
  }

  async dispose() {
    this._oracle     = null;
    this._chronicle  = null;
    this._probation  = null;
    this._llm        = null;
  }
}

// ── System Prompt ──────────────────────────────────────────────
const SCAFFOLD_SYSTEM_PROMPT = `You are the SDOA Scaffold engine — an expert code generator for Self-Describing Object Architecture v5.4.

You generate complete, production-quality SDOA module source files from plain-text descriptions.

Rules:
1. Every file MUST begin with: // Last modified: YYYY-MM-DD HH:MM UTC
2. Every class MUST have a complete static MANIFEST = { ... } block with all required fields.
3. For standard modules: version MUST be "5.0.0". For sleeve modules: version MUST be "1.0.0".
4. operationalRole MUST be "savant" unless the module is a named system sovereign.
5. All lifecycle methods MUST be implemented — even if only as stubs with a clear TODO.
6. NEVER write window.currentUser = ... or any direct global state mutation.
7. NEVER use setTimeout() for initialization — use lifecycle init().
8. NEVER write manual switch statements for routing.
9. For NodeJS modules: end with module.exports = ClassName;
10. For Browser modules: wrap in (function(){ "use strict"; ... window.ClassName = ClassName; })();
11. Return ONLY the source file. No explanation text outside the code.

Sleeve rules (type = "sleeve" only):
S1. MANIFEST MUST include external: { system, transport, path, commands[] }.
S2. NEVER call fs.writeFileSync on any peer module file.
S3. NEVER use eval() or Function() constructors.
S4. NEVER hardcode absolute paths — use PathResolver.service for all paths.
S5. All results MUST be returned through ResponseFormatter.service format: { ok, data } or { ok: false, error }.
S6. requires[] MUST include ResponseFormatter.service and PathResolver.service.
S7. File MUST stay under 500 lines.`;

// ── Manifest Skeleton (included in prompt) ──────────────────────
const MANIFEST_SKELETON = `// Standard module skeleton (v5.0):
static MANIFEST = {
  id:              "MyModule.workflow",
  type:            "workflow",
  layer:           3,
  runtime:         "NodeJS",
  version:         "5.0.0",
  operationalRole: "savant",
  requires:        [],
  dataFiles:       [],
  lifecycle:       ["init", "run", "dispose"],
  actions: {
    commands: {
      run: { description: "...", input: { param: "string?" }, output: "object" }
    },
    events:  { "module:completed": { payload: { result: "object" } } },
    accepts: {},
    slots:   {}
  },
  docs: { description: "...", author: "ProtoAI Core Architecture Group", sdoa: "5.0.0" }
};

// Sleeve skeleton (v5.4) — use when moduleType = "sleeve":
static MANIFEST = {
  id:              "MyApi.module",
  type:            "sleeve",
  layer:           3,
  runtime:         "NodeJS",
  version:         "1.0.0",
  operationalRole: "savant",
  requires:        ["ResponseFormatter.service", "PathResolver.service"],
  external: {
    system:    "my-external-system",
    transport: "https",
    path:      "auto",
    commands:  ["run", "stream"]
  },
  dataFiles: [],
  lifecycle: ["init", "run", "dispose"],
  actions: {
    commands: {
      run: { description: "...", input: { param: "string?" }, output: "object" }
    },
    events:  {},
    accepts: {},
    slots:   {}
  },
  docs: { description: "...", author: "ProtoAI Core Architecture Group", sdoa: "5.4" }
};`;

// ── Default Templates ───────────────────────────────────────────
const DEFAULT_TEMPLATES = [
  {
    type:      "workflow",
    lifecycle: ["init", "run", "dispose"],
    lineLimit: 200,
    example:   "// See FetchUsers.workflow.js in server/workflows/"
  },
  {
    type:      "service",
    lifecycle: ["init", "run", "dispose"],
    lineLimit: 200,
    example:   "// See Chronicle.service.js in server/services/"
  },
  {
    type:      "primitive",
    lifecycle: ["init", "mount", "update", "unmount", "destroy"],
    lineLimit: 150,
    example:   "// See Button.prim.js in ui/primitives/Button/"
  },
  {
    type:      "feature",
    lifecycle: ["init", "mount", "update", "unmount", "destroy"],
    lineLimit: 200,
    example:   "// See Dashboard.feature.js in ui/features/Dashboard/"
  },
  {
    type:      "repository",
    lifecycle: ["init"],
    lineLimit: 200,
    example:   "// See Memory.repository.js in server/repositories/"
  },
  {
    type:      "adapter",
    lifecycle: ["init", "mount", "update", "unmount", "destroy"],
    lineLimit: 200,
    example:   "// See DataAdapter.adapter.js in ui/adapters/"
  },
  {
    type:      "sleeve",
    lifecycle: ["init", "run", "dispose"],
    lineLimit: 500,
    example:   "// See AiSleeve.module.ts or PolicySleeve.module.js in portfolio/substrate/adapters/"
  }
];

module.exports = ScaffoldWorkflow;
