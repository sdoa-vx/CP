// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "String.capability"
// type:            "capability_module"
// layer:           2
// runtime:         "C++20"
// version:         "1.0.0"
// timestamp:       "2026-06-24T06:55:00Z"
// operationalRole: "capability_stdlib"
// optimization:    { priority: "correctness" }
// capabilities:    ["String::concat", "String::split", "String::replace",
//                   "String::trim", "String::to_upper", "String::to_lower",
//                   "String::format"]
// dependencies:    ["capabilities.hpp"]
// docs:            "Pure, deterministic string transformation capabilities."
// ============================================================================

#include "core/capabilities/capabilities.hpp"
#include <algorithm>
#include <cctype>
#include <sstream>
#include <stdexcept>

namespace sdoa::caps {

using nlohmann::json;

// Coerce a JSON value to a string for concatenation/formatting. Strings pass
// through verbatim; everything else uses its compact JSON dump (deterministic).
static std::string stringify(const json& v) {
    if (v.is_string()) return v.get<std::string>();
    if (v.is_null())   return "";
    return v.dump();
}

static std::string require_text(const json& in, const char* field = "text") {
    if (!in.contains(field) || !in[field].is_string()) {
        throw std::runtime_error(std::string("String capability requires string field '") + field + "'");
    }
    return in[field].get<std::string>();
}

void register_string(Engine& engine) {
    engine.register_capability("String", "concat", [](const json& in) -> json {
        if (!in.contains("parts") || !in["parts"].is_array()) {
            throw std::runtime_error("String::concat requires array field 'parts'");
        }
        const std::string sep = in.value("sep", std::string{});
        std::string out;
        bool first = true;
        for (const auto& p : in["parts"]) {
            if (!first) out += sep;
            out += stringify(p);
            first = false;
        }
        return json{{"result", out}};
    });

    engine.register_capability("String", "split", [](const json& in) -> json {
        std::string text = require_text(in);
        std::string sep = in.value("sep", std::string{","});
        json arr = json::array();
        if (sep.empty()) { // split into characters
            for (char ch : text) arr.push_back(std::string(1, ch));
            return json{{"result", arr}};
        }
        size_t pos = 0, prev = 0;
        while ((pos = text.find(sep, prev)) != std::string::npos) {
            arr.push_back(text.substr(prev, pos - prev));
            prev = pos + sep.size();
        }
        arr.push_back(text.substr(prev));
        return json{{"result", arr}};
    });

    engine.register_capability("String", "replace", [](const json& in) -> json {
        std::string text = require_text(in);
        std::string find = in.value("find", std::string{});
        std::string repl = in.value("replace", std::string{});
        if (find.empty()) return json{{"result", text}};
        std::string out;
        size_t pos = 0, prev = 0;
        while ((pos = text.find(find, prev)) != std::string::npos) {
            out += text.substr(prev, pos - prev);
            out += repl;
            prev = pos + find.size();
        }
        out += text.substr(prev);
        return json{{"result", out}};
    });

    engine.register_capability("String", "trim", [](const json& in) -> json {
        std::string text = require_text(in);
        auto notspace = [](unsigned char c) { return !std::isspace(c); };
        text.erase(text.begin(), std::find_if(text.begin(), text.end(), notspace));
        text.erase(std::find_if(text.rbegin(), text.rend(), notspace).base(), text.end());
        return json{{"result", text}};
    });

    engine.register_capability("String", "to_upper", [](const json& in) -> json {
        std::string text = require_text(in);
        std::transform(text.begin(), text.end(), text.begin(),
                       [](unsigned char c) { return std::toupper(c); });
        return json{{"result", text}};
    });

    engine.register_capability("String", "to_lower", [](const json& in) -> json {
        std::string text = require_text(in);
        std::transform(text.begin(), text.end(), text.begin(),
                       [](unsigned char c) { return std::tolower(c); });
        return json{{"result", text}};
    });

    // String::format -> replaces {key} tokens with stringified args[key].
    // Unknown tokens are left intact. Deterministic.
    engine.register_capability("String", "format", [](const json& in) -> json {
        if (!in.contains("template") || !in["template"].is_string()) {
            throw std::runtime_error("String::format requires string field 'template'");
        }
        std::string tmpl = in["template"].get<std::string>();
        json args = in.value("args", json::object());
        std::string out;
        out.reserve(tmpl.size());
        for (size_t i = 0; i < tmpl.size(); ++i) {
            if (tmpl[i] == '{') {
                size_t close = tmpl.find('}', i);
                if (close != std::string::npos) {
                    std::string key = tmpl.substr(i + 1, close - i - 1);
                    if (args.is_object() && args.contains(key)) {
                        out += stringify(args[key]);
                        i = close;
                        continue;
                    }
                }
            }
            out += tmpl[i];
        }
        return json{{"result", out}};
    });
}

} // namespace sdoa::caps
