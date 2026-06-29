// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "model_parser.cpp"
// type:            "module"
// layer:           2
// runtime:         "C++20"
// version:         "1.0.0"
// operationalRole: "serialization"
// optimization:    { priority: "correctness" }
// capabilities:    ["parse_model"]
// dependencies:    ["model.hpp", "nlohmann_json"]
// docs:            "JSON deserialization into SDOA Model. Parses domains,
//                   modules, capabilities, dependencies, invariants.
//                   Builds the module_index for O(1) lookups."
// ============================================================================

#include "model.hpp"

using json = nlohmann::json;

namespace sdoa {

static CapabilitySignature parse_capability(const json& j) {
    CapabilitySignature cap;
    cap.name = j.at("name").get<std::string>();
    if (j.contains("inputs"))
        for (const auto& t : j["inputs"])
            cap.inputs.push_back(value_type_from_string(t.get<std::string>()));
    if (j.contains("outputs"))
        for (const auto& t : j["outputs"])
            cap.outputs.push_back(value_type_from_string(t.get<std::string>()));
    return cap;
}

static Invariant parse_invariant(const json& j) {
    return {
        j.at("kind").get<std::string>(),
        j.value("subject", ""),
        j.value("target", ""),
        j.value("message", "")
    };
}

static Module parse_module(const json& j) {
    Module mod;
    mod.id = j.at("id").get<std::string>();
    if (j.contains("capabilities"))
        for (const auto& c : j["capabilities"])
            mod.capabilities.push_back(parse_capability(c));
    if (j.contains("dependencies"))
        for (const auto& d : j["dependencies"])
            mod.dependencies.push_back(d.get<std::string>());
    if (j.contains("invariants"))
        for (const auto& i : j["invariants"])
            mod.invariants.push_back(parse_invariant(i));
    return mod;
}

static Domain parse_domain(const json& j) {
    Domain dom;
    dom.id = j.at("id").get<std::string>();
    if (j.contains("modules"))
        for (const auto& m : j["modules"])
            dom.modules.push_back(parse_module(m));
    return dom;
}

Model parse_model(const nlohmann::json& j) {
    if (!j.contains("domains") || !j["domains"].is_array())
        throw std::runtime_error("Model JSON must contain a 'domains' array");

    Model model;
    for (const auto& d : j["domains"]) {
        Domain dom = parse_domain(d);
        std::string id = dom.id;
        model.domains.emplace(id, std::move(dom));
    }

    model.buildIndex();
    return model;
}

} // namespace sdoa
