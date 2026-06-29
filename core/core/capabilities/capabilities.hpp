// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "capabilities.hpp"
// type:            "header"
// layer:           2
// runtime:         "C++20"
// version:         "1.0.0"
// timestamp:       "2026-06-24T06:55:00Z"
// operationalRole: "capability_stdlib"
// optimization:    { priority: "correctness" }
// dependencies:    ["engine.hpp"]
// docs:            "Phase 4.1 built-in capability standard library. Pure,
//                   deterministic, JSON-native, parallel-safe. Each category
//                   registers onto an Engine via its public register_capability
//                   API, so the engine core stays decoupled from the stdlib.
//                   Convention: every capability takes a JSON object of named
//                   params and returns a JSON object whose primary value is the
//                   'result' field (so downstream steps reference @step.result)."
// ============================================================================

#pragma once

#include "core/runtime/engine.hpp"
#include <string>

namespace sdoa::caps {

// Configuration for capabilities that need controlled environment access.
struct CapabilitiesConfig {
    // Sandbox root for the read-only FileSystem capabilities. All paths are
    // resolved relative to (and confined within) this directory. Empty = the
    // FileSystem module is registered but every call errors (no root configured).
    std::string fs_root;
};

// Per-category registration (each is independent and pure except FileSystem).
void register_string(Engine& engine);
void register_math(Engine& engine);
void register_json(Engine& engine);
void register_filesystem(Engine& engine, const std::string& root);
void register_system(Engine& engine);

// Register the entire Phase 4.1 standard library in one call.
void register_capabilities(Engine& engine, const CapabilitiesConfig& cfg);

// 5.B (step 1): attach input/output JSON Schemas to the built-in stdlib caps.
void attach_stdlib_schemas(Engine& engine);

// True if module_id names a sovereign built-in module (foreign capabilities
// may not collide with these). Built-ins: String, Math, Json, FileSystem, System.
bool is_builtin_module(const std::string& module_id);

} // namespace sdoa::caps
