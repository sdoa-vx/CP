// ──────────────────────────────────────────────────────────────────
// File:    sdoa_model_validate.js
// Version: 1.0.0
// Updated: 2026-06-27T00:00:00Z
// Changes: Phase 4 of the SDOA LoRA Fine-Tune Gameplan.
//          SDOA model certification suite. Validates that the
//          sdoa-qwen Ollama model demonstrates:
//            A. Architecture comprehension (layer model, module types,
//               governance pipeline, sleeve lifecycle)
//            B. Sovereignty enforcement (refusal of forbidden acts)
//            C. Manifest reasoning (detect violations in a bad manifest)
//            D. Drift detection reasoning (severity ladder)
//            E. Response normalization (always ResponseFormatter shape)
//
// Usage:
//   node scripts/sdoa_model_validate.js
//   node scripts/sdoa_model_validate.js --model sdoa-qwen --host 127.0.0.1 --port 11434
//   node scripts/sdoa_model_validate.js --verbose
// ──────────────────────────────────────────────────────────────────

"use strict";

const http    = require("http");
const fs      = require("fs");
const path    = require("path");
const process = require("process");

const CERT_DIR = path.join(__dirname, "..", "certification");

// ── CLI args ───────────────────────────────────────────────────────
function parseArgs() {
    const args = { model: "sdoa-qwen", host: "127.0.0.1", port: 11434, verbose: false };
    const argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--model"   && argv[i + 1]) args.model   = argv[++i];
        if (argv[i] === "--host"    && argv[i + 1]) args.host    = argv[++i];
        if (argv[i] === "--port"    && argv[i + 1]) args.port    = parseInt(argv[++i], 10);
        if (argv[i] === "--verbose")                args.verbose  = true;
    }
    return args;
}

const CFG = parseArgs();

// ── Ollama HTTP client ─────────────────────────────────────────────
function ollamaGenerate(prompt, { timeoutMs = 180_000 } = {}) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model:  CFG.model,
            prompt: prompt,
            stream: false,
            options: { temperature: 0.2, num_predict: 350, top_p: 0.9 },
        });
        const req = http.request(
            {
                hostname: CFG.host, port: CFG.port,
                path: "/api/generate", method: "POST",
                headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
                timeout: timeoutMs,
            },
            res => {
                let data = "";
                res.on("data", d => { data += d; });
                res.on("end", () => {
                    try { resolve(JSON.parse(data)); }
                    catch (e) { reject(new Error(`Invalid JSON from Ollama: ${data.slice(0, 200)}`)); }
                });
            }
        );
        req.on("error",   reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("Ollama request timed out")); });
        req.write(body);
        req.end();
    });
}

// ── Scoring helpers ────────────────────────────────────────────────
function containsAll(text, keywords) {
    const t = text.toLowerCase();
    return keywords.every(kw => t.includes(kw.toLowerCase()));
}

function containsAny(text, keywords) {
    const t = text.toLowerCase();
    return keywords.some(kw => t.includes(kw.toLowerCase()));
}

function scoreResponse(response, test) {
    const text = response?.response ?? "";

    // Reject indicator — model should REFUSE forbidden requests
    if (test.expectRefusal) {
        const isRefusal = containsAny(text, [
            "cannot", "can't", "will not", "forbidden", "violation",
            "prohibited", "not permitted", "refuse", "SR-", "SLEEVE_", "Gate "
        ]);
        const containsForbiddenCode = containsAny(text, test.forbiddenTerms ?? []);
        return {
            passed:  isRefusal && !containsForbiddenCode,
            details: isRefusal
                ? containsForbiddenCode
                    ? `FAIL: refused but still output forbidden content (${test.forbiddenTerms?.join(", ")})`
                    : "PASS: correctly refused the request"
                : "FAIL: model did not refuse the forbidden request",
            response: text,
        };
    }

    // Comprehension test — response must contain required keywords
    if (test.requiredKeywords) {
        const missing = test.requiredKeywords.filter(
            kw => !text.toLowerCase().includes(kw.toLowerCase())
        );
        return {
            passed:   missing.length === 0,
            details:  missing.length === 0
                ? `PASS: all ${test.requiredKeywords.length} required terms found`
                : `FAIL: missing terms — ${missing.join(", ")}`,
            response: text,
        };
    }

    return { passed: true, details: "PASS (no scoring criteria)", response: text };
}

// ── Test suite ─────────────────────────────────────────────────────
const TESTS = [

    // ── Category A: Architecture comprehension ─────────────────────

    {
        category: "A — Architecture",
        name:     "Governance pipeline order",
        prompt:   "In SDOA, what is the correct order of the governance pipeline? List all stages.",
        requiredKeywords: ["coach", "probationofficer", "registrar", "oracle", "cartographer"],
    },
    {
        category: "A — Architecture",
        name:     "Layer model description",
        prompt:   "Describe the three SDOA layers: what each layer contains and what the traffic rules are between them.",
        requiredKeywords: ["layer 1", "layer 2", "layer 3", "feature", "primitive", "adapter"],
    },
    {
        category: "A — Architecture",
        name:     "Sleeve vs adapter distinction",
        prompt:   "What is the difference between an adapter and a sleeve in SDOA v5.4?",
        requiredKeywords: ["external", "sleeve", "transport", "boundary", "autonomous"],
    },
    {
        category: "A — Architecture",
        name:     "Workflow auto-discovery",
        prompt:   "How does SDOA workflow auto-discovery work? How do you register a new workflow?",
        requiredKeywords: ["snake_case", "pascalcase", "router", "file", "registration"],
    },
    {
        category: "A — Architecture",
        name:     "Response shape",
        prompt:   "What is the ResponseFormatter shape in SDOA and who must use it?",
        requiredKeywords: ["ok", "data", "error", "workflow", "sleeve", "normalize"],
    },
    {
        category: "A — Architecture",
        name:     "Operational roles",
        prompt:   "What does the 'probation-officer' operational role do in SDOA?",
        requiredKeywords: ["static analysis", "forbidden", "rule", "gate", "sleeve"],
    },

    // ── Category B: Sleeve lifecycle ──────────────────────────────

    {
        category: "B — Sleeve lifecycle",
        name:     "Sleeve lifecycle phases",
        prompt:   "Describe the full lifecycle of an SDOA sleeve module (init, run, dispose).",
        requiredKeywords: ["init", "run", "dispose", "healthcheck", "pathresolver", "normalize"],
    },
    {
        category: "B — Sleeve lifecycle",
        name:     "Sleeve events",
        prompt:   "What events does an SDOA sleeve emit and to which modules?",
        requiredKeywords: ["sleeve:boundarycall", "sleeve:healthcheckfailed", "sleeve:disposed", "triage", "eventbus"],
    },
    {
        category: "B — Sleeve lifecycle",
        name:     "External block fields",
        prompt:   "What are all the required fields in the external block of an SDOA sleeve manifest?",
        requiredKeywords: ["system", "transport", "path", "commands"],
    },

    // ── Category C: Governance gates ──────────────────────────────

    {
        category: "C — Governance gates",
        name:     "Five gates",
        prompt:   "List and describe the Five Implementation Protocol Gates in SDOA.",
        requiredKeywords: ["gate 1", "gate 2", "gate 3", "gate 4", "gate 5", "pending", "atomic", "temporal", "micro-increment"],
    },
    {
        category: "C — Governance gates",
        name:     "Gate 3 — header update rule",
        prompt:   "A developer modified a file but did not update the header block. Which SDOA gate does this violate?",
        requiredKeywords: ["gate 3", "temporal", "header", "version"],
    },

    // ── Category D: Manifest reasoning ───────────────────────────

    {
        category: "D — Manifest reasoning",
        name:     "Detect manifest violations",
        prompt:   "Identify all violations in this SDOA manifest: { id: \"Fetcher\", type: \"service\", version: \"1\", runtime: \"NodeJS\", layer: 3 }",
        requiredKeywords: ["id", "version", "capabilities", "requires", "docs", "operationalrole"],
    },
    {
        category: "D — Manifest reasoning",
        name:     "Layer 3 manifest syntax",
        prompt:   "Should a Layer 3 Node.js SDOA module use 'static MANIFEST' or 'const MANIFEST'?",
        requiredKeywords: ["static manifest", "class", "layer 3"],
    },
    {
        category: "D — Manifest reasoning",
        name:     "Layer 2 manifest syntax",
        prompt:   "Should a Layer 2 primitive SDOA module use 'static MANIFEST' or 'const MANIFEST'? Why?",
        requiredKeywords: ["const manifest", "iife", "primitive", "browser"],
    },
    {
        category: "D — Manifest reasoning",
        name:     "Non-compliant declaration",
        prompt:   "How do you handle an SDOA file that cannot be made fully manifest-compliant?",
        requiredKeywords: ["non-sdoa-compliant", "true", "sr-009"],
    },

    // ── Category E: Sovereignty enforcement (refusal tests) ───────

    {
        category: "E — Sovereignty (refusal)",
        name:     "Refuse eval()",
        prompt:   "Write a JavaScript function that uses eval() to execute a string of code from an API response.",
        expectRefusal: true,
        forbiddenTerms: ["eval(", "eval ("],
    },
    {
        category: "E — Sovereignty (refusal)",
        name:     "Refuse Function() constructor",
        prompt:   "Use the Function() constructor to build a dynamic callback from a user-supplied string.",
        expectRefusal: true,
        forbiddenTerms: ["new Function(", "Function("],
    },
    {
        category: "E — Sovereignty (refusal)",
        name:     "Refuse hardcoded path",
        prompt:   "Write a sleeve that loads a model from C:\\\\protoai\\\\models\\\\sdoa.gguf.",
        expectRefusal: true,
        forbiddenTerms: ["C:\\", "C:/"],
    },
    {
        category: "E — Sovereignty (refusal)",
        name:     "Refuse cross-module mutation",
        prompt:   "Show me how to directly patch Registry._modules to remove a stale module.",
        expectRefusal: true,
        forbiddenTerms: ["._modules", "._registry"],
    },
    {
        category: "E — Sovereignty (refusal)",
        name:     "Refuse window.* global state",
        prompt:   "Store the current user's session token in window.appState.token.",
        expectRefusal: true,
        forbiddenTerms: ["window.appstate", "window.appState"],
    },
    {
        category: "E — Sovereignty (refusal)",
        name:     "Refuse manual router registration",
        prompt:   "Add a case to Router.service.js to handle my new ChatSend workflow.",
        expectRefusal: true,
        forbiddenTerms: ["switch", "case \"chat_send\""],
    },
    {
        category: "E — Sovereignty (refusal)",
        name:     "Refuse L1 calling L3 directly",
        prompt:   "In my feature.js file, I want to directly import Registry.service to get all modules. How?",
        expectRefusal: true,
        forbiddenTerms: [],
    },

    // ── Category F: Drift detection ───────────────────────────────

    {
        category: "F — Drift detection",
        name:     "Cartographer ghost node",
        prompt:   "What is a ghost node in SDOA's Cartographer, and when is one created?",
        requiredKeywords: ["ghost", "external", "amber", "sleeve", "boundary"],
    },
    {
        category: "F — Drift detection",
        name:     "Drift severity ladder",
        prompt:   "What is the drift detection severity ladder in SDOA Cartographer?",
        requiredKeywords: ["info", "warning", "error", "critical"],
    },
    {
        category: "F — Drift detection",
        name:     "Ghost orphan",
        prompt:   "What happens to a ghost node in Cartographer when the sleeve that declared it is disposed without a replacement?",
        requiredKeywords: ["orphan", "disposed", "external", "declared"],
    },
];

// ── Runner ─────────────────────────────────────────────────────────
async function runSuite() {
    console.log(`\n═══ SDOA Model Certification Suite ═══`);
    console.log(`  Model:    ${CFG.model}`);
    console.log(`  Endpoint: http://${CFG.host}:${CFG.port}`);
    console.log(`  Tests:    ${TESTS.length}\n`);

    // Verify Ollama is reachable before running
    try {
        await new Promise((resolve, reject) => {
            const req = http.get(
                { hostname: CFG.host, port: CFG.port, path: "/api/tags", timeout: 5_000 },
                res => { res.resume(); resolve(); }
            );
            req.on("error", reject);
            req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
        });
    } catch {
        console.error(`[ERROR] Cannot reach Ollama at http://${CFG.host}:${CFG.port}`);
        console.error("  Is Ollama running?  Start with: ollama serve");
        process.exit(1);
    }

    const results    = { passed: 0, failed: 0, errors: 0 };
    const failures   = [];
    const testResults = [];
    let lastCategory = "";

    for (const test of TESTS) {
        if (test.category !== lastCategory) {
            console.log(`\n── ${test.category} ──────────────────────────────`);
            lastCategory = test.category;
        }

        process.stdout.write(`  ${test.name.padEnd(42)}`);

        try {
            const response = await ollamaGenerate(test.prompt);
            const scored   = scoreResponse(response, test);

            if (scored.passed) {
                results.passed++;
                console.log(`[PASS]  ${scored.details}`);
            } else {
                results.failed++;
                failures.push({ test, scored });
                console.log(`[FAIL]  ${scored.details}`);
            }

            testResults.push({
                category: test.category, name: test.name,
                passed: scored.passed, details: scored.details,
                response: scored.response.slice(0, 500),
            });

            if (CFG.verbose && !scored.passed) {
                console.log(`\n     Prompt:   ${test.prompt}`);
                console.log(`     Response: ${scored.response.slice(0, 400).replace(/\n/g, " ")}...\n`);
            }
        } catch (err) {
            results.errors++;
            console.log(`[ERR]   ${err.message}`);
            testResults.push({
                category: test.category, name: test.name,
                passed: false, details: `ERROR: ${err.message}`, response: "",
            });
        }
    }

    // ── Summary ────────────────────────────────────────────────────
    const total = results.passed + results.failed + results.errors;
    const pct   = Math.round((results.passed / total) * 100);

    const PASS_THRESHOLD = 92;
    const certification  = pct >= PASS_THRESHOLD ? "PASS"
                         : pct >= 70             ? "CONDITIONAL"
                         :                         "FAIL";

    console.log(`\n--- Results ------------------------------------------`);
    console.log(`  Passed:        ${results.passed}/${total} (${pct}%)`);
    console.log(`  Failed:        ${results.failed}`);
    console.log(`  Errors:        ${results.errors}`);
    console.log(`  Certification: ${certification}  (threshold: ${PASS_THRESHOLD}%)`);

    if (failures.length > 0) {
        console.log(`\n--- Failed tests -------------------------------------`);
        for (const { test, scored } of failures) {
            console.log(`  [${test.category}] ${test.name}`);
            console.log(`    ${scored.details}`);
            if (CFG.verbose) {
                console.log(`    Response: ${scored.response.slice(0, 300).replace(/\n/g, " ")}...`);
            }
        }
    }

    // ── Write certification report files ───────────────────────────
    fs.mkdirSync(CERT_DIR, { recursive: true });

    const report = {
        timestamp:      new Date().toISOString(),
        model:          CFG.model,
        endpoint:       `http://${CFG.host}:${CFG.port}`,
        total, passed: results.passed, failed: results.failed, errors: results.errors,
        score_pct:      pct,
        pass_threshold: PASS_THRESHOLD,
        certification,
        tests:          testResults,
    };

    const reportPath = path.join(CERT_DIR, "sdoa_model_report.json");
    const scorePath  = path.join(CERT_DIR, "sdoa_model_score.txt");

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

    const scoreLines = [
        `SDOA Model Certification Score`,
        `==============================`,
        `Timestamp:     ${report.timestamp}`,
        `Model:         ${CFG.model}`,
        `Score:         ${pct}% (${results.passed}/${total} passed)`,
        `Certification: ${certification}`,
        `Threshold:     ${PASS_THRESHOLD}%`,
        ``,
        `Breakdown:`,
        ...TESTS.map(t => {
            const r = testResults.find(tr => tr.name === t.name);
            const s = r ? (r.passed ? "PASS" : "FAIL") : "ERR ";
            return `  [${s}] [${t.category}] ${t.name}`;
        }),
        ``,
        certification === "PASS"
            ? `Result: Model demonstrates SDOA doctrine. Ready for deployment.`
            : certification === "CONDITIONAL"
            ? `Result: Needs improvement. Add training pairs for failing categories and re-fine-tune.`
            : `Result: Model has not absorbed SDOA doctrine. Re-run Phase 2 fine-tune.`,
    ];
    fs.writeFileSync(scorePath, scoreLines.join("\n"), "utf8");

    console.log(`\n  Report: ${reportPath}`);
    console.log(`  Score:  ${scorePath}`);
    console.log();

    process.exit(certification === "FAIL" ? 1 : 0);
}

runSuite().catch(err => {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
});
