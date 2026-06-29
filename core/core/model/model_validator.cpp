// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "model_validator.cpp"
// type:            "module"
// layer:           2
// runtime:         "C++20"
// version:         "1.0.0"
// operationalRole: "infrastructure"
// optimization:    { priority: "correctness" }
// capabilities:    ["validate_model"]
// dependencies:    ["model.hpp"]
// docs:            "Post-parse SDOA Model validation. Checks: empty IDs,
//                   duplicate module IDs, self-dependencies, broken dependency
//                   references, modules with zero capabilities. Returns a
//                   single ValidationResult with ok/message."
// ============================================================================

#include "model.hpp"
#include <unordered_set>

namespace sdoa {

ValidationResult validate_model(const Model& model) {
    std::unordered_set<std::string> seen_modules;

    for (const auto& [dom_id, domain] : model.domains) {
        if (dom_id.empty())
            return {false, "Domain has an empty ID"};

        for (const auto& mod : domain.modules) {
            // Empty module ID
            if (mod.id.empty())
                return {false, "Module in domain '" + dom_id + "' has an empty ID"};

            // Duplicate module ID
            if (seen_modules.count(mod.id))
                return {false, "Duplicate module ID: '" + mod.id + "'"};
            seen_modules.insert(mod.id);

            // Zero capabilities
            if (mod.capabilities.empty())
                return {false, "Module '" + mod.id + "' declares zero capabilities"};

            // Self-dependency
            for (const auto& dep : mod.dependencies)
                if (dep == mod.id)
                    return {false, "Module '" + mod.id + "' depends on itself"};

            // Broken dependency
            for (const auto& dep : mod.dependencies)
                if (!model.findModule(dep))
                    return {false, "Module '" + mod.id + "' depends on '" + dep + "' which does not exist"};
        }
    }

    return {true, ""};
}

} // namespace sdoa
