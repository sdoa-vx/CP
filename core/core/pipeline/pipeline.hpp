// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "pipeline.hpp"
// type:            "header"
// layer:           2
// runtime:         "C++20"
// version:         "1.0.0"
// operationalRole: "contract_definition"
// optimization:    { priority: "correctness" }
// dependencies:    ["model.hpp"]
// docs:            "Defines the Pipeline Contract execution DAG."
// ============================================================================

#pragma once

#include "core/model/model.hpp"
#include <string>
#include <vector>
#include <unordered_map>
#include <nlohmann/json.hpp>

namespace sdoa {

struct PipelineStep {
    std::string id;
    std::string module_id;
    std::string capability;
    nlohmann::json input;
};

struct PipelineEdge {
    std::string source_step;
    std::string target_step;
};

struct Pipeline {
    std::string id;
    bool strict = false;  // strict deterministic mode (5.2): reject nondeterministic caps at graph build
    bool allow_nondeterminism = false;  // 6.1: must be true to permit nondeterministic/network capabilities
    std::unordered_map<std::string, PipelineStep> steps;
    std::vector<PipelineEdge> edges;

    std::vector<std::string> get_root_steps() const {
        std::unordered_map<std::string, int> in_degree;
        for (const auto& [id, step] : steps) {
            in_degree[id] = 0;
        }
        for (const auto& edge : edges) {
            in_degree[edge.target_step]++;
        }
        std::vector<std::string> roots;
        for (const auto& [id, deg] : in_degree) {
            if (deg == 0) roots.push_back(id);
        }
        return roots;
    }
};

Pipeline parse_pipeline(const nlohmann::json& j);

ValidationResult validate_pipeline(const Pipeline& pipeline, const Model& model);

} // namespace sdoa
