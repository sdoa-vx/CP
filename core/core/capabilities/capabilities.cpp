// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "capabilities.cpp"
// type:            "module"
// layer:           2
// runtime:         "C++20"
// version:         "1.0.0"
// timestamp:       "2026-06-24T06:55:00Z"
// operationalRole: "capability_stdlib"
// optimization:    { priority: "correctness" }
// capabilities:    ["register_capabilities"]
// dependencies:    ["capabilities.hpp"]
// docs:            "Aggregator that installs the full Phase 4.1 standard library
//                   onto an Engine in one call."
// ============================================================================

#include "core/capabilities/capabilities.hpp"

namespace sdoa::caps {

bool is_builtin_module(const std::string& module_id) {
    return module_id == "String" || module_id == "Math" || module_id == "Json"
        || module_id == "FileSystem" || module_id == "System";
}


void attach_stdlib_schemas(Engine& engine) {
    auto J = [](const char* s) { return nlohmann::json::parse(s); };
    auto S = [&](const char* m, const char* c, const char* in, const char* out) {
        engine.set_capability_schema(m, c, J(in), J(out));
    };
    const char* RES_STR = R"({"type":"object","properties":{"result":{"type":"string"}},"required":["result"]})";
    const char* RES_NUM = R"({"type":"object","properties":{"result":{"type":"number"}},"required":["result"]})";
    const char* RES_ARR = R"({"type":"object","properties":{"result":{"type":"array"}},"required":["result"]})";
    const char* RES_OBJ = R"({"type":"object","properties":{"result":{"type":"object"}},"required":["result"]})";
    const char* RES_ANY = R"({"type":"object","properties":{"result":{}},"required":["result"]})";

    // String
    S("String","concat",   R"({"type":"object","properties":{"parts":{"type":"array"},"sep":{"type":"string"}},"required":["parts"]})", RES_STR);
    S("String","split",    R"({"type":"object","properties":{"text":{"type":"string"},"sep":{"type":"string"}},"required":["text"]})", RES_ARR);
    S("String","replace",  R"({"type":"object","properties":{"text":{"type":"string"},"find":{"type":"string"},"replace":{"type":"string"}},"required":["text"]})", RES_STR);
    S("String","trim",     R"({"type":"object","properties":{"text":{"type":"string"}},"required":["text"]})", RES_STR);
    S("String","to_upper", R"({"type":"object","properties":{"text":{"type":"string"}},"required":["text"]})", RES_STR);
    S("String","to_lower", R"({"type":"object","properties":{"text":{"type":"string"}},"required":["text"]})", RES_STR);
    S("String","format",   R"({"type":"object","properties":{"template":{"type":"string"},"args":{"type":"object"}},"required":["template"]})", RES_STR);

    // Math
    const char* AB = R"({"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]})";
    S("Math","add", AB, RES_NUM);
    S("Math","subtract", AB, RES_NUM);
    S("Math","multiply", AB, RES_NUM);
    S("Math","divide", AB, RES_NUM);
    S("Math","round", R"({"type":"object","properties":{"value":{"type":"number"},"places":{"type":"integer"}},"required":["value"]})", RES_NUM);
    S("Math","clamp", R"({"type":"object","properties":{"value":{"type":"number"},"min":{"type":"number"},"max":{"type":"number"}},"required":["value","min","max"]})", RES_NUM);
    S("Math","sum", R"({"type":"object","properties":{"values":{"type":"array"}},"required":["values"]})", RES_NUM);
    S("Math","avg", R"({"type":"object","properties":{"values":{"type":"array"}},"required":["values"]})", RES_NUM);

    // Json
    S("Json","get",       R"({"type":"object","properties":{"path":{"type":"string"}},"required":["data","path"]})", RES_ANY);
    S("Json","set",       R"({"type":"object","properties":{"path":{"type":"string"}},"required":["data","path","value"]})", RES_ANY);
    S("Json","remove",    R"({"type":"object","properties":{"path":{"type":"string"}},"required":["data","path"]})", RES_ANY);
    S("Json","merge",     R"({"type":"object","required":["base","override"]})", RES_ANY);
    S("Json","flatten",   R"({"type":"object","properties":{"data":{"type":"object"}},"required":["data"]})", RES_OBJ);
    S("Json","unflatten", R"({"type":"object","properties":{"data":{"type":"object"}},"required":["data"]})", RES_OBJ);
    S("Json","filter",    R"({"type":"object","properties":{"items":{"type":"array"},"key":{"type":"string"}},"required":["items","key","equals"]})", RES_ARR);
    S("Json","map",       R"({"type":"object","properties":{"items":{"type":"array"},"path":{"type":"string"}},"required":["items","path"]})", RES_ARR);

    // FileSystem (read-only)
    const char* PATH = R"({"type":"object","properties":{"path":{"type":"string"}},"required":["path"]})";
    S("FileSystem","read_text", PATH, RES_STR);
    S("FileSystem","read_json", PATH, RES_ANY);
    S("FileSystem","list_dir",  PATH, RES_ARR);
    S("FileSystem","stat",      PATH, RES_OBJ);

    // System
    S("System","echo",         R"({"type":"object"})", R"({"type":"object"})");
    S("System","version",      R"({"type":"object"})", RES_STR);
    S("System","capabilities", R"({"type":"object"})", RES_ARR);
}

void register_capabilities(Engine& engine, const CapabilitiesConfig& cfg) {
    register_string(engine);
    register_math(engine);
    register_json(engine);
    register_filesystem(engine, cfg.fs_root);
    register_system(engine);
    attach_stdlib_schemas(engine);
}

} // namespace sdoa::caps
