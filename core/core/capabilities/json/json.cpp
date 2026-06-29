// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "Json.capability"
// type:            "capability_module"
// layer:           2
// runtime:         "C++20"
// version:         "1.0.0"
// timestamp:       "2026-06-24T06:55:00Z"
// operationalRole: "capability_stdlib"
// optimization:    { priority: "correctness" }
// capabilities:    ["Json::get", "Json::set", "Json::remove", "Json::merge",
//                   "Json::flatten", "Json::unflatten", "Json::filter", "Json::map"]
// dependencies:    ["capabilities.hpp", "merge.hpp"]
// docs:            "JSON shaping capabilities. Pure & deterministic. Paths are
//                   dot-delimited; integer segments index into arrays. Reuses the
//                   engine's deep_merge for Json::merge so semantics match the
//                   pipeline output-propagation layer exactly."
// ============================================================================

#include "core/capabilities/capabilities.hpp"
#include "core/runtime/merge.hpp"
#include <sstream>
#include <stdexcept>
#include <vector>

namespace sdoa::caps {

using nlohmann::json;

static std::vector<std::string> split_path(const std::string& path) {
    std::vector<std::string> parts;
    std::stringstream ss(path);
    std::string seg;
    while (std::getline(ss, seg, '.')) {
        if (seg.empty()) throw std::runtime_error("Json: empty segment in path '" + path + "'");
        parts.push_back(seg);
    }
    if (parts.empty()) throw std::runtime_error("Json: empty path");
    return parts;
}

static bool is_index(const std::string& s) {
    if (s.empty()) return false;
    for (char c : s) if (c < '0' || c > '9') return false;
    return true;
}

static const json& require_data(const json& in) {
    if (!in.contains("data")) throw std::runtime_error("Json capability requires field 'data'");
    return in["data"];
}

static std::string require_path(const json& in) {
    if (!in.contains("path") || !in["path"].is_string()) {
        throw std::runtime_error("Json capability requires string field 'path'");
    }
    return in["path"].get<std::string>();
}

// Recursive immutable set: returns a copy of `node` with `parts[idx..]` set.
static json set_at(const json& node, const std::vector<std::string>& parts, size_t idx, const json& value) {
    if (idx == parts.size()) return value;
    const std::string& seg = parts[idx];
    if (is_index(seg) && (node.is_array() || node.is_null())) {
        json arr = node.is_array() ? node : json::array();
        size_t i = std::stoul(seg);
        while (arr.size() <= i) arr.push_back(json(nullptr));
        arr[i] = set_at(arr[i], parts, idx + 1, value);
        return arr;
    }
    json obj = node.is_object() ? node : json::object();
    json child = obj.contains(seg) ? obj[seg] : json(nullptr);
    obj[seg] = set_at(child, parts, idx + 1, value);
    return obj;
}

static json remove_at(const json& node, const std::vector<std::string>& parts, size_t idx) {
    if (idx + 1 == parts.size()) {
        json copy = node;
        const std::string& seg = parts[idx];
        if (copy.is_object()) copy.erase(seg);
        else if (copy.is_array() && is_index(seg)) {
            size_t i = std::stoul(seg);
            if (i < copy.size()) copy.erase(copy.begin() + i);
        }
        return copy;
    }
    const std::string& seg = parts[idx];
    json copy = node;
    if (copy.is_object() && copy.contains(seg)) {
        copy[seg] = remove_at(copy[seg], parts, idx + 1);
    } else if (copy.is_array() && is_index(seg)) {
        size_t i = std::stoul(seg);
        if (i < copy.size()) copy[i] = remove_at(copy[i], parts, idx + 1);
    }
    return copy;
}

static void flatten_into(const json& node, const std::string& prefix, json& out) {
    if (node.is_object() && !node.empty()) {
        for (auto& [k, v] : node.items()) {
            flatten_into(v, prefix.empty() ? k : prefix + "." + k, out);
        }
    } else {
        out[prefix] = node; // leaves, empty objects, arrays, primitives
    }
}

void register_json(Engine& engine) {
    engine.register_capability("Json", "get", [](const json& in) -> json {
        const json& data = require_data(in);
        auto parts = split_path(require_path(in));
        const json* cur = &data;
        for (const auto& seg : parts) {
            if (cur->is_object() && cur->contains(seg)) {
                cur = &(*cur)[seg];
            } else if (cur->is_array() && is_index(seg) && std::stoul(seg) < cur->size()) {
                cur = &(*cur)[std::stoul(seg)];
            } else {
                throw std::runtime_error("Json::get path not found at segment '" + seg + "'");
            }
        }
        return json{{"result", *cur}};
    });

    engine.register_capability("Json", "set", [](const json& in) -> json {
        const json& data = require_data(in);
        if (!in.contains("value")) throw std::runtime_error("Json::set requires field 'value'");
        auto parts = split_path(require_path(in));
        return json{{"result", set_at(data, parts, 0, in["value"])}};
    });

    engine.register_capability("Json", "remove", [](const json& in) -> json {
        const json& data = require_data(in);
        auto parts = split_path(require_path(in));
        return json{{"result", remove_at(data, parts, 0)}};
    });

    engine.register_capability("Json", "merge", [](const json& in) -> json {
        if (!in.contains("base") || !in.contains("override")) {
            throw std::runtime_error("Json::merge requires fields 'base' and 'override'");
        }
        return json{{"result", deep_merge(in["base"], in["override"])}};
    });

    engine.register_capability("Json", "flatten", [](const json& in) -> json {
        const json& data = require_data(in);
        if (!data.is_object()) throw std::runtime_error("Json::flatten requires object 'data'");
        json out = json::object();
        flatten_into(data, "", out);
        return json{{"result", out}};
    });

    engine.register_capability("Json", "unflatten", [](const json& in) -> json {
        const json& data = require_data(in);
        if (!data.is_object()) throw std::runtime_error("Json::unflatten requires object 'data'");
        json out = json::object();
        for (auto& [k, v] : data.items()) {
            out = set_at(out, split_path(k), 0, v);
        }
        return json{{"result", out}};
    });

    // Json::filter -> keep array-of-objects items where item[key] == equals.
    engine.register_capability("Json", "filter", [](const json& in) -> json {
        if (!in.contains("items") || !in["items"].is_array()) {
            throw std::runtime_error("Json::filter requires array field 'items'");
        }
        if (!in.contains("key") || !in["key"].is_string()) {
            throw std::runtime_error("Json::filter requires string field 'key'");
        }
        if (!in.contains("equals")) throw std::runtime_error("Json::filter requires field 'equals'");
        std::string key = in["key"].get<std::string>();
        const json& target = in["equals"];
        json out = json::array();
        for (const auto& item : in["items"]) {
            if (item.is_object() && item.contains(key) && item[key] == target) {
                out.push_back(item);
            }
        }
        return json{{"result", out}};
    });

    // Json::map -> project a dotted path out of each array item.
    engine.register_capability("Json", "map", [](const json& in) -> json {
        if (!in.contains("items") || !in["items"].is_array()) {
            throw std::runtime_error("Json::map requires array field 'items'");
        }
        auto parts = split_path(require_path(in));
        json out = json::array();
        for (const auto& item : in["items"]) {
            const json* cur = &item;
            bool ok = true;
            for (const auto& seg : parts) {
                if (cur->is_object() && cur->contains(seg)) cur = &(*cur)[seg];
                else if (cur->is_array() && is_index(seg) && std::stoul(seg) < cur->size()) cur = &(*cur)[std::stoul(seg)];
                else { ok = false; break; }
            }
            out.push_back(ok ? *cur : json(nullptr));
        }
        return json{{"result", out}};
    });
}

} // namespace sdoa::caps
