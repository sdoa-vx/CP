// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "pipeline_parser.cpp"
// type:            "module"
// layer:           2
// runtime:         "C++20"
// version:         "1.0.0"
// operationalRole: "serialization"
// optimization:    { priority: "correctness" }
// capabilities:    ["parse_pipeline"]
// dependencies:    ["pipeline.hpp", "nlohmann_json"]
// docs:            "JSON deserialization into SDOA Pipeline DAG."
// ============================================================================

#include "pipeline.hpp"
#include <stdexcept>

using json = nlohmann::json;

namespace sdoa {

Pipeline parse_pipeline(const json& j) {
    if (!j.contains("id") || !j.contains("steps")) {
        throw std::runtime_error("Pipeline JSON must contain 'id' and 'steps'");
    }

    Pipeline pipeline;
    pipeline.id = j.at("id").get<std::string>();
    pipeline.strict = j.value("strict", false);
    pipeline.allow_nondeterminism = j.value("allow_nondeterminism", false);

    for (const auto& s : j["steps"]) {
        PipelineStep step;
        step.id = s.at("id").get<std::string>();
        step.module_id = s.at("module_id").get<std::string>();
        step.capability = s.at("capability").get<std::string>();
        if (s.contains("input")) {
            step.input = s.at("input");
        } else {
            step.input = nlohmann::json::object();
        }
        pipeline.steps[step.id] = step;
    }

    if (j.contains("edges")) {
        for (const auto& e : j["edges"]) {
            PipelineEdge edge;
            edge.source_step = e.at("source_step").get<std::string>();
            edge.target_step = e.at("target_step").get<std::string>();
            pipeline.edges.push_back(edge);
        }
    }

    return pipeline;
}

} // namespace sdoa
