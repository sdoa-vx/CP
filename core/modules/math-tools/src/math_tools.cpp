// ============================================================================
// SDOA example module: math-tools. Pure, deterministic integer capabilities.
// Built against the C ABI only; sdoa_* resolve from the host at dlopen.
// ============================================================================
#include "sdoa.h"
#include <nlohmann/json.hpp>
using json = nlohmann::json;

static long long get_int(const sdoa_json* in, const char* key, long long def = 0) {
    char* s = sdoa_json_stringify(in);
    json j = json::parse(s); sdoa_string_free(s);
    return j.value(key, def);
}
static sdoa_json* result_int(long long v) {
    json o = {{"result", v}}; const char* e = nullptr;
    return sdoa_json_parse(o.dump().c_str(), &e);
}
static sdoa_json* err(const char* msg) {
    json o = {{"__sdoa_error__", msg}}; const char* e = nullptr;
    return sdoa_json_parse(o.dump().c_str(), &e);
}

static sdoa_json* cap_factorial(const sdoa_json* in, void*) {
    long long n = get_int(in, "n");
    if (n < 0) return err("factorial: n must be >= 0");
    if (n > 20) return err("factorial: n too large (overflow)");
    long long r = 1; for (long long i = 2; i <= n; ++i) r *= i;
    return result_int(r);
}
static sdoa_json* cap_gcd(const sdoa_json* in, void*) {
    long long a = get_int(in, "a"), b = get_int(in, "b");
    a = a < 0 ? -a : a; b = b < 0 ? -b : b;
    while (b) { long long t = a % b; a = b; b = t; }
    return result_int(a);
}
static sdoa_json* cap_fibonacci(const sdoa_json* in, void*) {
    long long n = get_int(in, "n");
    if (n < 0) return err("fibonacci: n must be >= 0");
    if (n > 90) return err("fibonacci: n too large (overflow)");
    long long a = 0, b = 1; for (long long i = 0; i < n; ++i) { long long t = a + b; a = b; b = t; }
    return result_int(a);
}

extern "C" SDOA_API SDOA_Status sdoa_module_register(SDOA_EngineHandle e, const sdoa_module_env*) {
    sdoa_cap_desc f{}; f.module = "math-tools"; f.capability = "factorial"; f.fn = cap_factorial; f.flags = SDOA_CAP_PURE;
    if (sdoa_engine_register_foreign_capability(e, &f) != SDOA_OK) return SDOA_ERR_INTERNAL;
    sdoa_cap_desc g{}; g.module = "math-tools"; g.capability = "gcd"; g.fn = cap_gcd; g.flags = SDOA_CAP_PURE;
    if (sdoa_engine_register_foreign_capability(e, &g) != SDOA_OK) return SDOA_ERR_INTERNAL;
    sdoa_cap_desc b{}; b.module = "math-tools"; b.capability = "fibonacci"; b.fn = cap_fibonacci; b.flags = SDOA_CAP_PURE;
    if (sdoa_engine_register_foreign_capability(e, &b) != SDOA_OK) return SDOA_ERR_INTERNAL;
    return SDOA_OK;
}
