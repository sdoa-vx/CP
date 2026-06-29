// ============================================================================
// SDOA MANIFEST
// id:              "string-tools.module"
// type:            "module"
// layer:           4
// runtime:         "C++20"
// version:         "1.0.0"
// operationalRole: "foreign_module"
// docs:            "Sample loadable SDOA module. Exports sdoa_module_register,
//                   which registers its capabilities via the foreign-capability
//                   ABI. Built against the C ABI only; sdoa_* symbols resolve
//                   from the host libsdoa at dlopen time."
// ============================================================================
#include "sdoa.h"
#include <nlohmann/json.hpp>
#include <string>
#include <algorithm>
#include <cctype>

using json = nlohmann::json;

static sdoa_json* read_text_in(const sdoa_json* in, std::string& text) {
    char* s = sdoa_json_stringify(in);
    json j = json::parse(s);
    sdoa_string_free(s);
    text = j.value("text", std::string());
    return nullptr;
}
static sdoa_json* make_result(const std::string& v) {
    json o = {{"result", v}};
    const char* err = nullptr;
    return sdoa_json_parse(o.dump().c_str(), &err);
}

static sdoa_json* cap_upper(const sdoa_json* in, void*) {
    std::string t; read_text_in(in, t);
    std::transform(t.begin(), t.end(), t.begin(), [](unsigned char c){ return std::toupper(c); });
    return make_result(t);
}
static sdoa_json* cap_slugify(const sdoa_json* in, void*) {
    std::string t; read_text_in(in, t);
    std::string out;
    for (char c : t) {
        if (std::isalnum((unsigned char)c)) out += (char)std::tolower((unsigned char)c);
        else if ((c == ' ' || c == '-' || c == '_') && !out.empty() && out.back() != '-') out += '-';
    }
    while (!out.empty() && out.back() == '-') out.pop_back();
    return make_result(out);
}

extern "C" SDOA_API SDOA_Status sdoa_module_register(SDOA_EngineHandle engine, const sdoa_module_env* /*env*/) {
    sdoa_cap_desc up{};  up.module = "string-tools"; up.capability = "upper";   up.fn = cap_upper;   up.flags = SDOA_CAP_PURE;
    if (sdoa_engine_register_foreign_capability(engine, &up) != SDOA_OK) return SDOA_ERR_INTERNAL;
    sdoa_cap_desc sl{};  sl.module = "string-tools"; sl.capability = "slugify"; sl.fn = cap_slugify; sl.flags = SDOA_CAP_PURE;
    if (sdoa_engine_register_foreign_capability(engine, &sl) != SDOA_OK) return SDOA_ERR_INTERNAL;
    return SDOA_OK;
}
