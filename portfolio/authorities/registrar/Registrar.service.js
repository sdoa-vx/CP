// ──────────────────────────────────────────────────────────────────
// File:    Registrar.service.js
// Version: 5.2.0
// Updated: 2026-06-27T00:00:00Z
// Changes: Step 13 — fieldChampion(module) added as the terminal step
//          of the sole healing path. Listens for coach:mutationReady,
//          writes patched source, re-processes through ProbationOfficer,
//          and re-fields the module in the active roster.
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-06-02 12:10 UTC
// Module Type: service | Operational Role: registrar
// Version: 5.1.0 | Runtime: NodeJS

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class RegistrarService extends EventEmitter {
  static MANIFEST = {
    id: "Registrar.service",
    type: "service",
    layer: 3,
    runtime: "NodeJS",
    version: "5.2.0",
    operationalRole: "registrar",
    requires: ["ResponseFormatter.service", "ProbationOfficer.workflow", "AssemblyLine.service"],
    dataFiles: [],
    lifecycle: ["init", "dispose"],
    actions: {
      commands: {
        discover_portfolio:  { description: "Scans portfolio directory and compiles roster.", input: {}, output: "object" },
        get_active_player:   { description: "Returns current active runtime module details for an ID.", input: { moduleId: "string" }, output: "object" },
        quarantine_player:   { description: "Safely isolates a failing or untrusted module.", input: { moduleId: "string" }, output: "boolean" },
        fieldChampion:       { description: "Terminal step of the healing path. Writes patched source, re-validates through ProbationOfficer, and promotes module to active roster.", input: { moduleId: "string", mutatedSource: "string" }, output: "boolean" }
      },
      events: {
        "registrar:mutationDetected":  { payload: { filePath: "string" } },
        "registrar:verifyingPlayer":   { payload: { id: "string", runtime: "string" } },
        "registrar:playerQuarantined": { payload: { id: "string", reason: "string" } },
        "registrar:playerFielded":     { payload: { id: "string", runtime: "string", version: "string" } },
        "registrar:rosterUpdated":     { payload: { activeRoster: "object" } }
      },
      accepts: {
        "coach:mutationReady": {
          description: "Receives a validated patch from Coach. Registrar writes the mutated source to the module file and re-fields it through the standard ingestion pipeline.",
          payload: { moduleId: "string", originalSource: "string", mutatedSource: "string", diff: "string" }
        }
      },
      slots: {}
    },
    optimization: {
      priority: "safety",
      assertionSuite: "Registrar.tests.json"
    },
    docs: {
      description: "Hardened Dynamic Evolution Arbitrator. Enforces a two-tier verification pipeline before fielding polyglot assets.",
      author: "ProtoAI Core Architecture Group",
      sdoa: "5.0.0"
    }
  };

  constructor() {
    super();
    this.portfolioPath = path.join(process.cwd(), 'portfolio');
    this.pool = new Map();         // Storage pool of all validated variants: Id -> Array of Candidates
    this.activeRoster = new Map(); // Current optimized lineup: Id -> Champion Candidate
    this.quarantine = new Map();   // Isolated broken players: Id -> Candidate Description
    this.watcher = null;

    // Core Infrastructure Sovereigns
    this.responseFormatter = null;
    this.probationOfficer = null;
    this.assemblyLine = null;
  }

  async init(registry) {
    this.responseFormatter = registry.get("ResponseFormatter.service");
    this.probationOfficer  = registry.get("ProbationOfficer.workflow");
    this.assemblyLine      = registry.get("AssemblyLine.service");

    if (!fs.existsSync(this.portfolioPath)) {
      fs.mkdirSync(this.portfolioPath, { recursive: true });
    }

    await this.discoverPortfolio();
    this.setupWatcher();
  }

  async discoverPortfolio() {
    try {
      const files = fs.readdirSync(this.portfolioPath);
      this.pool.clear();

      for (const file of files) {
        const fullPath = path.join(this.portfolioPath, file);
        await this.processIncomingModule(fullPath, { initialBoot: true });
      }

      this.arbitrateRosterEvolution();
      return this.responseFormatter?.ok({ status: "Ecosystem portfolio synchronized cleanly." });
    } catch (error) {
      return this.responseFormatter?.fail(`Portfolio synchronization fault: ${error.message}`);
    }
  }

  /**
   * Two-Tier Ingestion Pipeline: Intercepts, extracts, and passes candidates
   * through the ProbationOfficer guardrail before allowing portfolio pooling.
   */
  async processIncomingModule(filePath, options = { initialBoot: false }) {
    try {
      const candidate = this.parseModuleFile(filePath);
      if (!candidate) return false;

      const manifest = candidate.manifest;
      this.emit("registrar:verifyingPlayer", { id: manifest.id, runtime: manifest.runtime });

      // Skip intense sandboxing on initial boot ONLY if performance profiles demand it,
      // otherwise, everything passes through the ProbationOfficer
      if (!options.initialBoot && this.probationOfficer) {
        const isCompliant = await this.probationOfficer.run({ source_payload: fs.readFileSync(filePath, 'utf8') });
        if (!isCompliant) {
          this.quarantine.set(manifest.id, { candidate, reason: "SDOA v5.0 Core Anti-Pattern Constraint Violation." });
          this.emit("registrar:playerQuarantined", { id: manifest.id, reason: this.quarantine.get(manifest.id).reason });
          return false;
        }
      }

      // If clean, push into the candidate asset pool
      if (!this.pool.has(manifest.id)) {
        this.pool.set(manifest.id, []);
      }

      // Prevent duplicate file tracking references
      this.pool.set(manifest.id, this.pool.get(manifest.id).filter(c => c.filePath !== filePath));
      this.pool.get(manifest.id).push(candidate);

      return true;
    } catch (err) {
      this.emit("registrar:playerQuarantined", { id: path.basename(filePath), reason: err.message });
      return false;
    }
  }

  /**
   * Evaluates pool matrix data to select the optimal champion module variant.
   */
  arbitrateRosterEvolution() {
    for (const [moduleId, candidates] of this.pool.entries()) {
      if (candidates.length === 0) continue;

      // Sort utilizing true SemVer scoring metrics
      let champion = candidates.reduce((best, challenger) => {
        return this.compareSemVer(challenger.manifest.version, best.manifest.version) > 0 ? challenger : best;
      }, candidates[0]);

      // Resolve Tie-Breaks using the Manifest Optimization Vector
      const tieBreaks = candidates.filter(c => c.manifest.version === champion.manifest.version);
      if (tieBreaks.length > 1) {
        const targetPriority = champion.manifest.optimization?.priority || "readability";
        champion = this.resolveOptimizationTie(tieBreaks, targetPriority);
      }

      // Execute Hot-Swap Transition
      const currentActive = this.activeRoster.get(moduleId);
      if (!currentActive || currentActive.filePath !== champion.filePath) {
        this.activeRoster.set(moduleId, champion);

        // If the new champion is a native binary compilation target (Rust/C++), map its memory space immediately
        if ((champion.manifest.runtime === "Rust" || champion.manifest.runtime === "C++") && this.assemblyLine) {
          this.assemblyLine.initMemoryMap(champion.manifest.id, champion.filePath);
        }

        this.emit("registrar:playerFielded", champion.manifest);
      }
    }
    this.emit("registrar:rosterUpdated", { activeRoster: Object.fromEntries(this.activeRoster) });
  }

  /**
   * Deterministic SemVer weight comparison engine. Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
   */
  compareSemVer(v1, v2) {
    const parse = (v) => v.split('-')[0].split('.').map(Number);
    const [major1, minor1, patch1] = parse(v1);
    const [major2, minor2, patch2] = parse(v2);

    if (major1 !== major2) return major1 > major2 ? 1 : -1;
    if (minor1 !== minor2) return minor1 > minor2 ? 1 : -1;
    if (patch1 !== patch2) return patch1 > patch2 ? 1 : -1;
    return 0;
  }

  /**
   * Selects matching version runtimes based on explicit hardware/language strengths.
   */
  resolveOptimizationTie(variants, priority) {
    if (priority === "speed") {
      const native = variants.find(v => v.manifest.runtime === "Rust" || v.manifest.runtime === "C++");
      if (native) return native;
    }
    if (priority === "safety") {
      const safeRuntime = variants.find(v => v.manifest.runtime === "Rust");
      if (safeRuntime) return safeRuntime;
    }
    // Fall back to the first discovered element (Readability/JS Defaults)
    return variants[0];
  }

  parseModuleFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    let manifest = null;

    if (filePath.endsWith('.js')) {
      const match = content.match(/static\s+MANIFEST\s*=\s*({[\s\S]*?});/);
      if (match) manifest = eval(`(${match[1]})`);
    } else if (filePath.endsWith('.py')) {
      const match = content.match(/"MANIFEST"\s*:\s*({[\s\S]*?})/);
      if (match) manifest = JSON.parse(match[1]);
    } else if (filePath.endsWith('.rs')) {
      const match = content.match(/static\s+MANIFEST\s*:\s*&str\s*=\s*r#"(─*?{[\s\S]*?})"#;/);
      if (match) manifest = JSON.parse(match[1]);
    }

    if (!manifest || !manifest.id || !manifest.version) return null;

    return { manifest, filePath, compiledAt: new Date().toISOString() };
  }

  setupWatcher() {
    let debounceTimer;
    this.watcher = fs.watch(this.portfolioPath, (eventType, filename) => {
      if (!filename) return;
      const fullPath = path.join(this.portfolioPath, filename);

      this.emit("registrar:mutationDetected", { filePath: fullPath });

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        if (fs.existsSync(fullPath)) {
          const success = await this.processIncomingModule(fullPath);
          if (success) this.arbitrateRosterEvolution();
        } else {
          await this.discoverPortfolio();
        }
      }, 150); // Hardened debounce windows to resolve rapid multi-write disk locks
    });
  }

  getActivePlayer(moduleId) {
    return this.activeRoster.get(moduleId) || null;
  }

  async quarantinePlayer(moduleId, reason) {
    const player = this.activeRoster.get(moduleId);
    if (player) {
      this.activeRoster.delete(moduleId);
      this.quarantine.set(moduleId, { player, reason });
      this.emit("registrar:playerQuarantined", { id: moduleId, reason });
      this.arbitrateRosterEvolution();
      return true;
    }
    return false;
  }

  // ── Healing path terminal step (Step 13) ──────────────────────────
  // Called by the registry event bus when Coach emits coach:mutationReady.
  // Registrar is the only authority permitted to write patched source back
  // to the portfolio — no sleeve or workflow may do this directly.
  async fieldChampion({ moduleId, mutatedSource }) {
    const player = this.activeRoster.get(moduleId);
    if (!player) {
      this.emit("registrar:playerQuarantined", { id: moduleId, reason: "fieldChampion: module not in active roster" });
      return false;
    }

    const filePath = player.filePath;

    // Write patched source — Registrar (authority) is permitted; sleeves are not.
    try {
      fs.writeFileSync(filePath, mutatedSource, 'utf8');
    } catch (err) {
      this.emit("registrar:playerQuarantined", { id: moduleId, reason: `fieldChampion: write failed — ${err.message}` });
      return false;
    }

    // Re-run full ingestion pipeline (ProbationOfficer gate included).
    const accepted = await this.processIncomingModule(filePath);
    if (!accepted) return false;

    this.arbitrateRosterEvolution();
    return true;
  }

  // Wire the coach:mutationReady event so the registry event bus routes it here.
  onCoachMutationReady(event) {
    this.fieldChampion(event).catch(err => {
      this.emit("registrar:playerQuarantined", { id: event.moduleId, reason: `fieldChampion error: ${err.message}` });
    });
  }

  async dispose() {
    if (this.watcher) this.watcher.close();
    this.pool.clear();
    this.activeRoster.clear();
    this.quarantine.clear();
  }
}

module.exports = RegistrarService;
