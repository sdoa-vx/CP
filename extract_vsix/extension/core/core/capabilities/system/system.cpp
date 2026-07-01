// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "System.capability"
// type:            "capability_module"
// layer:           2
// runtime:         "C++20"
// version:         "1.0.0"
// timestamp:       "2026-06-24T06:55:00Z"
// operationalRole: "capability_stdlib"
// optimization:    { priority: "correctness" }
// capabilities:    ["System::echo", "System::version", "System::capabilities"]
// dependencies:    ["capabilities.hpp"]
// docs:            "Pipeline introspection / meta capabilities. echo is the
//                   identity pass-through; capabilities reflects the engine's
//                   registered capability list (live, via Engine introspection),
//                   which powers dashboard discovery."
// ============================================================================

#include "core/capabilities/capabilities.hpp"

namespace sdoa::caps {

using nlohmann::json;

// Stdlib version is independent of the engine core version.
static constexpr const char* SDOA_STDLIB_VERSION = "4.1.0";

void register_system(Engine& engine) {
    // Identity: returns its input unchanged (useful as a join/debug node).
    engine.register_capability("System", "echo", [](const json& in) -> json {
        return in;
    });

    engine.register_capability("System", "version", [](const json&) -> json {
        return json{{"result", SDOA_STDLIB_VERSION}};
    });

    // Live capability discovery. Captures the engine by reference; safe because
    // capabilities outlive individual pipeline runs and the call is read-only.
    engine.register_capability("System", "capabilities", [&engine](const json&) -> json {
        return json{{"result", engine.list_capabilities()}};
    });
}

} // namespace sdoa::caps
