// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "pipeline_validator.cpp"
// type:            "module"
// layer:           2
// runtime:         "C++20"
// version:         "1.0.0"
// operationalRole: "validation"
// optimization:    { priority: "correctness" }
// capabilities:    ["validate_pipeline"]
// dependencies:    ["pipeline.hpp", "model.hpp"]
// docs:            "Enforces Pipeline structural integrity against the Model.
//                   Checks DAG acyclic property and validates capabilities."
// ============================================================================

#include "pipeline.hpp"
#include <unordered_set>
#include <queue>

namespace sdoa {

ValidationResult validate_pipeline(const Pipeline& pipeline, const Model& model) {
    if (pipeline.steps.empty()) {
        return {false, "Pipeline has no steps"};
    }

    // 1. Validate every step against the model
    for (const auto& [id, step] : pipeline.steps) {
        if (id.empty()) return {false, "Step has empty ID"};

        auto it = model.module_index.find(step.module_id);
        if (it == model.module_index.end()) {
            return {false, "Step '" + id + "' references unknown module '" + step.module_id + "'"};
        }

        const Module* mod = it->second;
        bool cap_found = false;
        for (const auto& cap : mod->capabilities) {
            if (cap.name == step.capability) {
                cap_found = true;
                break;
            }
        }
        if (!cap_found) {
            return {false, "Step '" + id + "' references unknown capability '" + step.capability + "' in module '" + step.module_id + "'"};
        }
    }

    // 2. Validate all edges reference valid steps
    std::unordered_map<std::string, int> in_degree;
    std::unordered_map<std::string, std::vector<std::string>> adj;
    
    for (const auto& [id, step] : pipeline.steps) {
        in_degree[id] = 0;
    }

    for (const auto& edge : pipeline.edges) {
        if (pipeline.steps.find(edge.source_step) == pipeline.steps.end()) {
            return {false, "Edge references unknown source step '" + edge.source_step + "'"};
        }
        if (pipeline.steps.find(edge.target_step) == pipeline.steps.end()) {
            return {false, "Edge references unknown target step '" + edge.target_step + "'"};
        }
        adj[edge.source_step].push_back(edge.target_step);
        in_degree[edge.target_step]++;
    }

    // 3. DAG acyclic check (Kahn's algorithm)
    std::queue<std::string> q;
    for (const auto& [id, deg] : in_degree) {
        if (deg == 0) q.push(id);
    }

    size_t processed = 0;
    while (!q.empty()) {
        std::string current = q.front();
        q.pop();
        processed++;

        for (const auto& next : adj[current]) {
            if (--in_degree[next] == 0) {
                q.push(next);
            }
        }
    }

    if (processed != pipeline.steps.size()) {
        return {false, "Pipeline contains a cycle"};
    }

    return {true, "OK"};
}

} // namespace sdoa
