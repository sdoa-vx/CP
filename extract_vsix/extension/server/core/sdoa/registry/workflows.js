"use strict";

/**
 * workflows.js — SDOA Workflow Registry
 *
 * Extracted from: blueprint.schema.json (workflow entries),
 * substrate/workflows/* (all workflow source files),
 * SDOA-Whitepaper-Technical.txt Section 9 (Router auto-discovery),
 * authorities/router/Router.service.js (_toWorkflowId convention)
 */

const WORKFLOW_REGISTRY = [
  {
    id:           "SendMessage.workflow",
    ipc_type:     "send_message",
    file:         "substrate/workflows/SendMessage.workflow.ts",
    description:  "LLM chat orchestrator. Detects provider (anthropic/openai/openrouter) from model string. Compiles conversation context. Streams response or returns full response. Handles context overflow retry.",
    requires:     ["LlmConnector.adapter", "PersistentMemory.service", "TokenBudget.adapter"],
    commands:     ["sendMessage"],
    events:       ["sendmessage:complete", "sendmessage:stream"],
    accepts:      []
  },
  {
    id:           "TestCore.workflow",
    ipc_type:     "run_test",
    file:         "substrate/workflows/TestCore.workflow.ts",
    description:  "Runs a single test case. Calls AiBroker.healTestFailure() on failure to attempt AI-powered auto-repair. Returns pass/fail result.",
    requires:     ["AiBroker.adapter", "Registry.service"],
    commands:     ["runTest"],
    events:       ["testcore:pass", "testcore:fail", "testcore:healed"],
    accepts:      []
  },
  {
    id:           "TestRunner.workflow",
    ipc_type:     "test_runner",
    file:         "substrate/workflows/TestRunner.workflow.ts",
    description:  "Runs a batch of test cases. Emits chapter demarcations. Aggregates results. Calls TestCore for each test.",
    requires:     ["TestCore.workflow", "Logger.service"],
    commands:     ["runTests"],
    events:       ["testrunner:start", "testrunner:progress", "testrunner:complete"],
    accepts:      []
  },
  {
    id:           "Scaffold.workflow",
    ipc_type:     "scaffold",
    file:         "substrate/workflows/Scaffold.workflow.js",
    description:  "AI-powered module generator. Pipeline: build spec → LLM → extract source → static validation (ProbationOfficer) → write to /portfolio → emit scaffold:moduleGenerated.",
    requires:     ["Registrar.service", "ProbationOfficer.workflow", "Registry.service"],
    commands:     ["scaffold"],
    events:       ["scaffold:moduleGenerated", "scaffold:failed"],
    accepts:      []
  },
  {
    id:           "ProbationOfficer.workflow",
    ipc_type:     "probation_officer",
    file:         "substrate/workflows/ProbationOfficer.workflow.js",
    description:  "Static analysis gatekeeper. Validates manifest presence, line counts by module type, and forbidden strings (eval, Function, window, global, etc.). All new scaffolded modules pass through this before portfolio acceptance.",
    requires:     ["Registry.service"],
    commands:     ["validate"],
    events:       ["probationofficer:approved", "probationofficer:rejected"],
    accepts:      []
  }
];

// ─── Workflow Rules ───────────────────────────────────────────────────────────
const WORKFLOW_RULES = [
  "Workflows are Layer 3 modules that respond to IPC messages routed by Router.service.js.",
  "Creating a workflow file IS the registration step. No manual switch statements needed.",
  "The workflow's IPC message type is the snake_case form of its ID (e.g., 'SendMessage.workflow' handles 'send_message' messages).",
  "Every workflow must implement a run(payload) method that returns { ok: true, data } or { ok: false, error }.",
  "Workflows use the backend lifecycle: init(), run(), dispose().",
  "Workflows must declare 'static MANIFEST = { ... }' as a class static property.",
  "Workflows are auto-discovered by the Router — their file name + registration in the Registry is sufficient."
];

module.exports = { WORKFLOW_REGISTRY, WORKFLOW_RULES };
