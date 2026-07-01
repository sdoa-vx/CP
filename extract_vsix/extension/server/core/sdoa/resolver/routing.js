
const MANIFEST = {
  id: "routing.js",
  type: "module",
  layer: 4,
  runtime: "JavaScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "_toWorkflowId",
    "addMiddleware",
    "registry.get"
  ],
  dependencies: [
    " authorities/router/Router.service.js",
    "SDOA-Whitepaper-Technical.txt",
    "SDOA-Governance-Outline.txt",
    "routes.jsn"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

"use strict";

/**
 * routing.js — SDOA Routing Rules
 *
 * Extracted from: authorities/router/Router.service.js (complete source),
 * SDOA-Whitepaper-Technical.txt Sections 9, 10, 15,
 * SDOA-Governance-Outline.txt Section 5
 */

const ROUTING_RULES = {

  // ─── Auto-Discovery Rule ──────────────────────────────────────────────────
  AUTO_DISCOVERY: {
    description:   "Router.service.js is a self-configuring IPC message dispatcher. No manual registration is needed.",
    rule:          "Creating a workflow file IS the registration step. The router discovers workflows by ID, not by a switch statement.",
    anti_pattern:  "Do NOT add a case statement, routing table entry, or registration call to Router.service.js when adding a new workflow.",
    mechanism:     "The router calls registry.get(workflowId) — if the workflow is in the registry, it is routable."
  },

  // ─── Message Type Conversion ──────────────────────────────────────────────
  MESSAGE_TYPE_CONVERSION: {
    description:   "Incoming IPC messages use snake_case type names. The router converts them to PascalCase workflow IDs.",
    function:      "_toWorkflowId(messageType)",
    algorithm: [
      "Split messageType on underscore '_'",
      "Capitalize the first letter of each word segment",
      "Join the segments with no separator",
      "The result is the PascalCase workflow name"
    ],
    examples: [
      { input: "fetch_users",        output: "FetchUsers" },
      { input: "send_message",       output: "SendMessage" },
      { input: "run_test",           output: "RunTest" },
      { input: "probation_officer",  output: "ProbationOfficer" },
      { input: "scaffold",           output: "Scaffold" },
      { input: "test_runner",        output: "TestRunner" }
    ]
  },

  // ─── Suffix Resolution Order ──────────────────────────────────────────────
  SUFFIX_RESOLUTION: {
    description:   "The router tries multiple module type suffixes in order to find the right module",
    suffixes_tried: ["workflow", "service", "repository", "adapter"],
    example:       "For message type 'send_message', router tries: 'SendMessage.workflow', 'SendMessage.service', 'SendMessage.repository', 'SendMessage.adapter'",
    rule:          "The first suffix that resolves to a registered module wins. If none match, a 404-equivalent error is returned."
  },

  // ─── Express Lanes ────────────────────────────────────────────────────────
  EXPRESS_LANES: {
    description:   "Named message types that bypass the middleware stack and route directly to their handler",
    rule:          "Express lane routes are declared in the router configuration. They skip all middleware processing.",
    use_case:      "High-frequency or latency-sensitive messages (e.g., heartbeat, ping, progress updates) that should not wait for middleware processing.",
    configuration: "Configured via routes.jsn in authorities/router/ or via router init() configuration object."
  },

  // ─── Middleware Stack ─────────────────────────────────────────────────────
  MIDDLEWARE: {
    description:   "The configurable middleware stack that all non-express-lane messages pass through",
    rule:          "Middleware functions are added to the router via addMiddleware(). They execute in the order they were added.",
    middleware_signature: "(message, next) => void — must call next() to pass to the next middleware",
    use_cases:     ["Authentication/authorization", "Rate limiting", "Request logging", "Request transformation"],
    bypass:        "Express lane messages bypass all middleware."
  },

  // ─── IPC Message Contract ─────────────────────────────────────────────────
  IPC_MESSAGE_CONTRACT: {
    description:   "The shape of IPC messages the router receives",
    inbound_shape: "{ type: string (snake_case), payload: any, requestId?: string }",
    outbound_shape: "ResponseFormatter shape: { ok: true, data: any } | { ok: false, error: string }",
    error_handling: "If no handler is found for a message type, router returns { ok: false, error: 'No handler found for {type}' }",
    error_propagation: "If the handler throws, router returns { ok: false, error: error.message }"
  },

  // ─── Dispatch Rules ───────────────────────────────────────────────────────
  DISPATCH: {
    description:   "How the router dispatches a message to its handler",
    steps: [
      "Receive IPC message with type field in snake_case",
      "Convert type to PascalCase workflow ID using _toWorkflowId()",
      "Try each suffix in order (workflow, service, repository, adapter)",
      "Call registry.get(id) for each candidate",
      "If found, call module.run(message.payload) and return the result",
      "If not found after all suffixes, return error response"
    ],
    run_method:    "The dispatched module must implement a run(payload) method that accepts the message payload and returns a ResponseFormatter-shaped result."
  },

  // ─── Event-Driven Alternative ────────────────────────────────────────────
  EVENTBUS_ROUTING: {
    description:   "Alternative to IPC routing — modules can communicate via the EventBus without the Router",
    rule:          "EventBus routing is for internal cross-module pub/sub. IPC routing via Router is for external client-to-backend messages.",
    eventbus_pattern: "emit(eventName, payload) → on(eventName, handler)",
    router_pattern:   "IPC message type → router dispatch → module.run(payload) → response"
  }
};

module.exports = { ROUTING_RULES };
