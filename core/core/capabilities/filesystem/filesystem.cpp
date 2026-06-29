// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "FileSystem.capability"
// type:            "capability_module"
// layer:           2
// runtime:         "C++20"
// version:         "1.0.0"
// timestamp:       "2026-06-24T06:55:00Z"
// operationalRole: "capability_stdlib"
// optimization:    { priority: "safety" }
// capabilities:    ["FileSystem::read_text", "FileSystem::read_json",
//                   "FileSystem::list_dir", "FileSystem::stat"]
// dependencies:    ["capabilities.hpp"]
// docs:            "Sandboxed, READ-ONLY filesystem capabilities (Phase 4.1).
//                   Every input path is resolved relative to a configured root
//                   and confined within it (path-traversal and absolute escapes
//                   are rejected). Read-only => deterministic given a fixed tree
//                   and safe to run in parallel. Writes arrive in Phase 4.5."
// ============================================================================

#include "core/capabilities/capabilities.hpp"
#include <filesystem>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <vector>
#include <algorithm>

namespace sdoa::caps {

using nlohmann::json;
namespace fs = std::filesystem;

// Resolve a caller-supplied relative path against `root`, confining it within.
// Throws on missing root, absolute paths, or any escape above root.
static fs::path resolve_sandboxed(const std::string& root, const json& in) {
    if (root.empty()) throw std::runtime_error("FileSystem: no sandbox root configured");
    if (!in.contains("path") || !in["path"].is_string()) {
        throw std::runtime_error("FileSystem capability requires string field 'path'");
    }
    fs::path rel(in["path"].get<std::string>());
    if (rel.is_absolute()) throw std::runtime_error("FileSystem: absolute paths are not permitted");

    fs::path root_norm = fs::weakly_canonical(fs::path(root)).lexically_normal();
    fs::path combined = (root_norm / rel).lexically_normal();

    // Confinement check: combined must be root_norm or a descendant of it.
    auto rit = root_norm.begin();
    auto cit = combined.begin();
    for (; rit != root_norm.end(); ++rit, ++cit) {
        if (cit == combined.end() || *cit != *rit) {
            throw std::runtime_error("FileSystem: path escapes sandbox root");
        }
    }
    return combined;
}

void register_filesystem(Engine& engine, const std::string& root) {
    engine.register_capability("FileSystem", "read_text", [root](const json& in) -> json {
        fs::path p = resolve_sandboxed(root, in);
        std::ifstream f(p, std::ios::binary);
        if (!f) throw std::runtime_error("FileSystem::read_text cannot open file");
        std::ostringstream ss;
        ss << f.rdbuf();
        return json{{"result", ss.str()}};
    });

    engine.register_capability("FileSystem", "read_json", [root](const json& in) -> json {
        fs::path p = resolve_sandboxed(root, in);
        std::ifstream f(p, std::ios::binary);
        if (!f) throw std::runtime_error("FileSystem::read_json cannot open file");
        json parsed;
        try {
            f >> parsed;
        } catch (const json::exception& e) {
            throw std::runtime_error(std::string("FileSystem::read_json parse error: ") + e.what());
        }
        return json{{"result", parsed}};
    });

    engine.register_capability("FileSystem", "list_dir", [root](const json& in) -> json {
        fs::path p = resolve_sandboxed(root, in);
        if (!fs::exists(p) || !fs::is_directory(p)) {
            throw std::runtime_error("FileSystem::list_dir not a directory");
        }
        std::vector<std::string> names;
        for (const auto& entry : fs::directory_iterator(p)) {
            names.push_back(entry.path().filename().string());
        }
        std::sort(names.begin(), names.end()); // deterministic ordering
        return json{{"result", names}};
    });

    engine.register_capability("FileSystem", "stat", [root](const json& in) -> json {
        fs::path p = resolve_sandboxed(root, in);
        json info;
        bool exists = fs::exists(p);
        info["exists"] = exists;
        info["is_file"] = exists && fs::is_regular_file(p);
        info["is_dir"]  = exists && fs::is_directory(p);
        info["size"] = (exists && fs::is_regular_file(p))
                       ? static_cast<long long>(fs::file_size(p)) : 0;
        return json{{"result", info}};
    });
}

} // namespace sdoa::caps
