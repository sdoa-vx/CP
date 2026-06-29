// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "Math.capability"
// type:            "capability_module"
// layer:           2
// runtime:         "C++20"
// version:         "1.0.0"
// timestamp:       "2026-06-24T06:55:00Z"
// operationalRole: "capability_stdlib"
// optimization:    { priority: "correctness" }
// capabilities:    ["Math::add", "Math::subtract", "Math::multiply",
//                   "Math::divide", "Math::round", "Math::clamp",
//                   "Math::sum", "Math::avg"]
// dependencies:    ["capabilities.hpp"]
// docs:            "Pure, deterministic numeric transform capabilities. All
//                   arithmetic is done in double; integral results are returned
//                   as integers when they have no fractional part."
// ============================================================================

#include "core/capabilities/capabilities.hpp"
#include <cmath>
#include <stdexcept>

namespace sdoa::caps {

using nlohmann::json;

static double require_num(const json& in, const char* field) {
    if (!in.contains(field) || !in[field].is_number()) {
        throw std::runtime_error(std::string("Math capability requires numeric field '") + field + "'");
    }
    return in[field].get<double>();
}

// Return an int when the double is integral (and in range), else the double.
// Keeps JSON output clean and deterministic across runs.
static json num(double d) {
    if (std::isfinite(d) && std::floor(d) == d &&
        d <= 9007199254740992.0 && d >= -9007199254740992.0) {
        return json(static_cast<long long>(d));
    }
    return json(d);
}

void register_math(Engine& engine) {
    engine.register_capability("Math", "add", [](const json& in) -> json {
        return json{{"result", num(require_num(in, "a") + require_num(in, "b"))}};
    });
    engine.register_capability("Math", "subtract", [](const json& in) -> json {
        return json{{"result", num(require_num(in, "a") - require_num(in, "b"))}};
    });
    engine.register_capability("Math", "multiply", [](const json& in) -> json {
        return json{{"result", num(require_num(in, "a") * require_num(in, "b"))}};
    });
    engine.register_capability("Math", "divide", [](const json& in) -> json {
        double b = require_num(in, "b");
        if (b == 0.0) throw std::runtime_error("Math::divide by zero");
        return json{{"result", num(require_num(in, "a") / b)}};
    });
    engine.register_capability("Math", "round", [](const json& in) -> json {
        double v = require_num(in, "value");
        int places = in.value("places", 0);
        double factor = std::pow(10.0, places);
        return json{{"result", num(std::round(v * factor) / factor)}};
    });
    engine.register_capability("Math", "clamp", [](const json& in) -> json {
        double v = require_num(in, "value");
        double lo = require_num(in, "min");
        double hi = require_num(in, "max");
        if (lo > hi) throw std::runtime_error("Math::clamp requires min <= max");
        return json{{"result", num(v < lo ? lo : (v > hi ? hi : v))}};
    });
    engine.register_capability("Math", "sum", [](const json& in) -> json {
        if (!in.contains("values") || !in["values"].is_array()) {
            throw std::runtime_error("Math::sum requires array field 'values'");
        }
        double acc = 0.0;
        for (const auto& v : in["values"]) {
            if (!v.is_number()) throw std::runtime_error("Math::sum: non-numeric element");
            acc += v.get<double>();
        }
        return json{{"result", num(acc)}};
    });
    engine.register_capability("Math", "avg", [](const json& in) -> json {
        if (!in.contains("values") || !in["values"].is_array()) {
            throw std::runtime_error("Math::avg requires array field 'values'");
        }
        const auto& vals = in["values"];
        if (vals.empty()) throw std::runtime_error("Math::avg of empty array");
        double acc = 0.0;
        for (const auto& v : vals) {
            if (!v.is_number()) throw std::runtime_error("Math::avg: non-numeric element");
            acc += v.get<double>();
        }
        return json{{"result", num(acc / static_cast<double>(vals.size()))}};
    });
}

} // namespace sdoa::caps
