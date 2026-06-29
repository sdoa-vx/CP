#ifndef SDOA_MODEL_HPP
#define SDOA_MODEL_HPP

// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "model.hpp"
// type:            "module"
// layer:           1
// runtime:         "C++20"
// version:         "1.0.0"
// operationalRole: "core"
// optimization:    { priority: "performance" }
// capabilities:    ["ValueType", "Invariant", "CapabilitySignature", "Module",
//                   "Domain", "Model", "Model::buildIndex",
//                   "Model::findModule", "Model::findCapability",
//                   "parse_model", "ValidationResult", "validate_model"]
// dependencies:    ["nlohmann_json"]
// docs:            "The complete SDOA Model Contract. Defines the static
//                   universe: value types, invariants, capability signatures,
//                   modules, domains, and the model itself. Includes free
//                   function declarations for parsing and validation.
//                   The Model is validated once and becomes immutable."
// ============================================================================

#include <string>
#include <vector>
#include <unordered_map>
#include <nlohmann/json.hpp>

namespace sdoa {

// ---------------------------------------------------------------------------
// Value Types
// ---------------------------------------------------------------------------

enum class ValueType {
    String, Int, Float, Bool, Json, ByteArray, Unknown
};

inline ValueType value_type_from_string(const std::string& s) {
    if (s == "string") return ValueType::String;
    if (s == "int")    return ValueType::Int;
    if (s == "float")  return ValueType::Float;
    if (s == "bool")   return ValueType::Bool;
    if (s == "json")   return ValueType::Json;
    if (s == "bytes")  return ValueType::ByteArray;
    return ValueType::Unknown;
}

inline std::string value_type_to_string(ValueType t) {
    switch (t) {
        case ValueType::String:    return "string";
        case ValueType::Int:       return "int";
        case ValueType::Float:     return "float";
        case ValueType::Bool:      return "bool";
        case ValueType::Json:      return "json";
        case ValueType::ByteArray: return "bytes";
        default:                   return "unknown";
    }
}

// ---------------------------------------------------------------------------
// Structures
// ---------------------------------------------------------------------------

struct Invariant {
    std::string kind;
    std::string subject;
    std::string target;
    std::string message;
};

struct CapabilitySignature {
    std::string name;
    std::vector<ValueType> inputs;
    std::vector<ValueType> outputs;
};

struct Module {
    std::string id;
    std::vector<CapabilitySignature> capabilities;
    std::vector<std::string> dependencies;
    std::vector<Invariant> invariants;
};

struct Domain {
    std::string id;
    std::vector<Module> modules;
};

struct Model {
    std::unordered_map<std::string, Domain> domains;
    std::unordered_map<std::string, const Module*> module_index;

    void buildIndex() {
        module_index.clear();
        for (const auto& [dom_id, domain] : domains)
            for (const auto& mod : domain.modules)
                module_index[mod.id] = &mod;
    }

    const Module* findModule(const std::string& id) const {
        auto it = module_index.find(id);
        return (it != module_index.end()) ? it->second : nullptr;
    }

    const CapabilitySignature* findCapability(const std::string& module_id,
                                               const std::string& cap_name) const {
        const Module* mod = findModule(module_id);
        if (!mod) return nullptr;
        for (const auto& cap : mod->capabilities)
            if (cap.name == cap_name) return &cap;
        return nullptr;
    }
};

// ---------------------------------------------------------------------------
// Parser (model_parser.cpp)
// ---------------------------------------------------------------------------

Model parse_model(const nlohmann::json& j);

// ---------------------------------------------------------------------------
// Validator (model_validator.cpp)
// ---------------------------------------------------------------------------

struct ValidationResult {
    bool ok;
    std::string message;
};

ValidationResult validate_model(const Model& model);

} // namespace sdoa

#endif // SDOA_MODEL_HPP
