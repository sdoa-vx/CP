// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "sdoa_c_api.cpp"
// type:            "module"
// layer:           4
// runtime:         "C++20"
// version:         "1.0.0"
// operationalRole: "infrastructure"
// optimization:    { priority: "stability" }
//                   "sdoa_engine_destroy", "sdoa_engine_load_model_from_json",
//                   "sdoa_engine_load_pipelines_from_json", "sdoa_engine_run_pipeline",
//                   "sdoa_result_to_json", "sdoa_result_destroy", "sdoa_get_last_error"]
// dependencies:    ["sdoa.h", "engine.hpp", "execution.hpp"]
// docs:            "C ABI glue — Model Contract MVP.
//                   Maps opaque SDOA_EngineHandle to unique_ptr<Engine>.
//                   No C++ exceptions escape this boundary."
// ============================================================================

#include "sdoa.h"
#include "runtime/engine.hpp"
#include "core/capabilities/capabilities.hpp"
#include <cstdlib>
#include <cstdint>
#include <cstring>
#include <algorithm>
#include <filesystem>
#include <fstream>
#include <vector>
#include <set>

#ifdef _WIN32
  #ifndef NOMINMAX
    #define NOMINMAX
  #endif
  #include <windows.h>
  static void* sdoa_dlopen(const char* p) { return (void*)LoadLibraryA(p); }
  static void* sdoa_dlsym(void* h, const char* s) { return (void*)GetProcAddress((HMODULE)h, s); }
  static void  sdoa_dlclose(void* h) { if (h) FreeLibrary((HMODULE)h); }
  static const char* sdoa_dlerror() { return "LoadLibrary error"; }
#else
  #include <dlfcn.h>
  static void* sdoa_dlopen(const char* p) { return dlopen(p, RTLD_NOW | RTLD_LOCAL); }
  static void* sdoa_dlsym(void* h, const char* s) { return dlsym(h, s); }
  static void  sdoa_dlclose(void* h) { if (h) dlclose(h); }
  static const char* sdoa_dlerror() { const char* e = dlerror(); return e ? e : "unknown"; }
#endif

// A module loaded from disk (Phase 6).
struct LoadedModule {
    std::string id, version, language, path, error;
    bool loaded = false;
    std::vector<std::string> capabilities;
    nlohmann::json sandbox;
    void* handle = nullptr;
};
#include <memory>
#include <cstring>
#include <algorithm>

// --- Opaque struct ---
struct SDOA_Engine_ {
    std::unique_ptr<sdoa::Engine> impl;
    std::vector<LoadedModule> modules;
};

struct SDOA_Result_ {
    std::unique_ptr<sdoa::ExecutionResult> impl;
    std::string cached_json;
};

// --- Map internal Result to ABI SDOA_Status ---
static SDOA_Status to_abi(sdoa::Result r) {
    switch (r) {
        case sdoa::Result::Ok:              return SDOA_OK;
        case sdoa::Result::InvalidArgument: return SDOA_ERR_INVALID_ARGUMENT;
        case sdoa::Result::ParseFailed:     return SDOA_ERR_PARSE_FAILED;
        case sdoa::Result::ModelInvalid:    return SDOA_ERR_MODEL_INVALID;
        case sdoa::Result::InvalidState:    return SDOA_ERR_INVALID_STATE;
        case sdoa::Result::Internal:        return SDOA_ERR_INTERNAL;
        default:                            return SDOA_ERR_INTERNAL;
    }
}

// --- Opaque JSON handle (backed by nlohmann::json) ---
struct sdoa_json { nlohmann::json j; };

namespace {

// Wrap a foreign callback into an internal CapabilityFn with crash isolation.
// JSON-only across the boundary; the engine owns the returned handle.
sdoa::CapabilityFn wrap_foreign_fn(sdoa_foreign_fn fn, void* user_data) {
    return [fn, user_data](const nlohmann::json& in) -> nlohmann::json {
        sdoa_json input{in};                  // borrowed by the callback
        sdoa_json* out = fn(&input, user_data);
        if (!out) {
            // NULL == host-side failure (e.g. a caught Python/Node exception).
            throw std::runtime_error("foreign capability returned null (host error)");
        }
        nlohmann::json result = std::move(out->j);
        delete out;                           // engine takes ownership and frees
        // Structured error channel.
        if (result.is_object() && result.contains("__sdoa_error__")) {
            const auto& e = result["__sdoa_error__"];
            throw std::runtime_error(e.is_string() ? e.get<std::string>() : e.dump());
        }
        return result;
    };
}

// SDOA compliance gate for foreign registrations.
bool validate_sdoa_compliance(const sdoa_cap_desc* d) {
    if (!d || !d->module || !d->capability || !d->fn) return false;
    std::string mod = d->module, cap = d->capability;
    if (mod.empty() || cap.empty()) return false;
    const bool pure = d->flags & SDOA_CAP_PURE;
    const bool se   = d->flags & SDOA_CAP_SIDE_EFFECTING;
    const bool nd   = d->flags & SDOA_CAP_NONDETERMINISTIC;
    if (pure && (se || nd)) return false;     // PURE is exclusive
    if (!pure && !se && !nd) return false;    // must declare something
    if (sdoa::caps::is_builtin_module(mod)) return false; // no collisions with sovereign built-ins
    return true;
}

} // namespace

extern "C" {

SDOA_API uint32_t sdoa_get_api_version(void) {
    return 1;
}

SDOA_API SDOA_Status sdoa_engine_create(const SDOA_Config* config, SDOA_EngineHandle* out) {
    if (!config || !out) return SDOA_ERR_INVALID_ARGUMENT;

    try {
        auto* h = new SDOA_Engine_;
        sdoa::EngineConfig ec;
        ec.thread_count = config->thread_count;
        ec.inline_execution = (config->flags & SDOA_FLAG_INLINE) != 0;
        h->impl = std::make_unique<sdoa::Engine>(ec);
        *out = h;
        return SDOA_OK;
    }
    catch (...) {
        return SDOA_ERR_INTERNAL;
    }
}

SDOA_API SDOA_Status sdoa_engine_destroy(SDOA_EngineHandle h) {
    if (h) {
        h->impl.reset();  // destroy the engine (and its capabilities) first
        for (auto& m : h->modules) sdoa_dlclose(m.handle);  // then unload module code
    }
    delete h;
    return SDOA_OK;
}

SDOA_API SDOA_Status sdoa_engine_load_model_from_json(SDOA_EngineHandle h, const char* json, size_t len) {
    if (!h || !json) return SDOA_ERR_INVALID_ARGUMENT;
    auto result = h->impl->load_model_from_json(std::string_view(json, len));
    return to_abi(result);
}

SDOA_API SDOA_Status sdoa_engine_load_pipelines_from_json(SDOA_EngineHandle h, const char* json, size_t len) {
    if (!h || !json) return SDOA_ERR_INVALID_ARGUMENT;
    auto result = h->impl->load_pipelines_from_json(std::string_view(json, len));
    return to_abi(result);
}

SDOA_API SDOA_Status sdoa_engine_run_pipeline(
    SDOA_EngineHandle h,
    const char* pipeline_id,
    const char* input_json,
    size_t input_len,
    SDOA_ResultHandle* out_result
) {
    if (!h || !pipeline_id || !input_json || !out_result) return SDOA_ERR_INVALID_ARGUMENT;

    try {
        auto input = nlohmann::json::parse(std::string_view(input_json, input_len));
        auto res = h->impl->run_pipeline(pipeline_id, input);
        
        auto* rh = new SDOA_Result_();
        rh->impl = std::move(res);
        *out_result = rh;
        return SDOA_OK;
    } catch (...) {
        return SDOA_ERR_PARSE_FAILED;
    }
}

SDOA_API SDOA_Status sdoa_result_to_json(
    SDOA_ResultHandle rh,
    char* buffer,
    size_t buffer_size,
    size_t* out_required_size
) {
    if (!rh) return SDOA_ERR_INVALID_ARGUMENT;

    if (rh->cached_json.empty()) {
        nlohmann::json j;
        j["success"] = rh->impl->success;
        if (!rh->impl->success) {
            j["error"] = rh->impl->error;
        } else {
            j["outputs"] = rh->impl->outputs;
        }
        if (!rh->impl->trace.empty()) {
            j["trace"] = rh->impl->trace;
        }
        rh->cached_json = j.dump();
    }

    if (out_required_size) {
        *out_required_size = rh->cached_json.size() + 1;
    }

    if (buffer && buffer_size > 0) {
        size_t n = std::min(buffer_size - 1, rh->cached_json.size());
        std::memcpy(buffer, rh->cached_json.data(), n);
        buffer[n] = '\0';
    }

    return SDOA_OK;
}

SDOA_API SDOA_Status sdoa_result_destroy(SDOA_ResultHandle rh) {
    delete rh;
    return SDOA_OK;
}

SDOA_API SDOA_Status sdoa_get_last_error(SDOA_EngineHandle h, char* buffer, size_t buffer_size, size_t* out_required) {
    if (!h) return SDOA_ERR_INVALID_ARGUMENT;

    const auto& err = h->impl->get_last_error();
    if (out_required) *out_required = err.size() + 1;

    if (buffer && buffer_size > 0) {
        size_t n = std::min(buffer_size - 1, err.size());
        std::memcpy(buffer, err.data(), n);
        buffer[n] = '\0';
    }

    return SDOA_OK;
}


SDOA_API SDOA_Status sdoa_engine_install_stdlib(SDOA_EngineHandle h, const char* fs_root) {
    if (!h) return SDOA_ERR_INVALID_ARGUMENT;
    try {
        sdoa::caps::CapabilitiesConfig cfg;
        cfg.fs_root = fs_root ? std::string(fs_root) : std::string();
        sdoa::caps::register_capabilities(*h->impl, cfg);
        return SDOA_OK;
    } catch (...) { return SDOA_ERR_INTERNAL; }
}

SDOA_API sdoa_json* sdoa_json_parse(const char* utf8, const char** err_msg) {
    if (err_msg) *err_msg = nullptr;
    if (!utf8) return nullptr;
    try {
        auto* h = new sdoa_json{nlohmann::json::parse(utf8)};
        return h;
    } catch (const std::exception& e) {
        if (err_msg) {
            const std::string m = e.what();
            char* buf = static_cast<char*>(std::malloc(m.size() + 1));
            if (buf) { std::memcpy(buf, m.c_str(), m.size() + 1); *err_msg = buf; }
        }
        return nullptr;
    }
}

SDOA_API char* sdoa_json_stringify(const sdoa_json* j) {
    if (!j) return nullptr;
    try {
        const std::string s = j->j.dump();
        char* buf = static_cast<char*>(std::malloc(s.size() + 1));
        if (buf) std::memcpy(buf, s.c_str(), s.size() + 1);
        return buf;
    } catch (...) { return nullptr; }
}

SDOA_API void sdoa_json_free(sdoa_json* j) { delete j; }

SDOA_API void sdoa_string_free(char* s) { std::free(s); }

SDOA_API SDOA_Status sdoa_engine_register_foreign_capability(SDOA_EngineHandle h, const sdoa_cap_desc* desc) {
    if (!h || !desc) return SDOA_ERR_INVALID_ARGUMENT;
    if (!validate_sdoa_compliance(desc)) return SDOA_ERR_NONCOMPLIANT;
    try {
        sdoa::CapabilityMeta meta;
        meta.flags    = desc->flags;
        meta.origin   = "foreign";
        meta.language = "foreign";
        h->impl->register_capability(desc->module, desc->capability,
                                     wrap_foreign_fn(desc->fn, desc->user_data), meta);
        return SDOA_OK;
    } catch (...) { return SDOA_ERR_INTERNAL; }
}

SDOA_API SDOA_Status sdoa_engine_capabilities_json(SDOA_EngineHandle h, char* buffer, size_t buffer_size, size_t* out_required_size) {
    if (!h) return SDOA_ERR_INVALID_ARGUMENT;
    try {
        const std::string s = h->impl->capabilities_manifest().dump();
        if (out_required_size) *out_required_size = s.size() + 1;
        if (buffer && buffer_size > 0) {
            size_t n = std::min(buffer_size - 1, s.size());
            std::memcpy(buffer, s.data(), n);
            buffer[n] = '\0';
        }
        return SDOA_OK;
    } catch (...) { return SDOA_ERR_INTERNAL; }
}


SDOA_API SDOA_Status sdoa_engine_load_modules(SDOA_EngineHandle h, const char* search_path) {
    if (!h || !search_path) return SDOA_ERR_INVALID_ARGUMENT;
    namespace fs = std::filesystem;
    std::error_code ec;
    fs::path root(search_path);
    if (!fs::is_directory(root, ec)) return SDOA_ERR_NOT_FOUND;

    nlohmann::json idx;
    { std::ifstream f(root / "index.json"); if (f) { try { f >> idx; } catch (...) {} } }
    auto entry_for = [&](const std::string& id) -> nlohmann::json {
        if (idx.contains("modules") && idx["modules"].contains(id)) return idx["modules"][id];
        return nlohmann::json::object();
    };
    auto vercmp = [](const std::string& a, const std::string& b) -> int {
        auto parts = [](const std::string& v){ std::vector<long> o; std::string c;
            for (char ch : v) { if (ch=='.') { o.push_back(c.empty()?0:std::stol(c)); c.clear(); } else if (ch>='0'&&ch<='9') c+=ch; }
            o.push_back(c.empty()?0:std::stol(c)); return o; };
        auto pa=parts(a), pb=parts(b);
        for (size_t i=0;i<std::max(pa.size(),pb.size());++i){ long x=i<pa.size()?pa[i]:0,y=i<pb.size()?pb[i]:0; if(x!=y) return x<y?-1:1; } return 0;
    };

    // Load one module directory and register its capabilities under `ns_id`
    // (empty ns_id => plain module id from the .so; legacy single-version).
    auto load_one = [&](const fs::path& d, const std::string& ns_id) {
        LoadedModule lm; lm.path = d.string();
        try {
            std::ifstream f(d / "module.json"); nlohmann::json mj; f >> mj;
            std::string parsed_id = mj.value("id", d.filename().string());
            lm.id = ns_id.empty() ? parsed_id : ns_id;
            lm.version = mj.value("version", std::string());
            lm.language = mj.value("language", std::string());
            if (mj.contains("capabilities") && mj["capabilities"].is_array())
                for (const auto& c : mj["capabilities"]) if (c.is_string()) lm.capabilities.push_back(c.get<std::string>());
            lm.sandbox = mj.value("sandbox", nlohmann::json::object());
            if (mj.value("unsafe", false)) throw std::runtime_error("SANDBOX_UNSAFE_MODULE: module declares unsafe:true (unsupported)");
            std::string ent = mj.value("entry", std::string());
            if (ent.empty()) throw std::runtime_error("module.json missing 'entry'");
            void* handle = sdoa_dlopen((d / ent).string().c_str());
            if (!handle) throw std::runtime_error(std::string("dlopen failed: ") + sdoa_dlerror());
            auto reg = reinterpret_cast<sdoa_module_register_fn>(sdoa_dlsym(handle, "sdoa_module_register"));
            if (!reg) { sdoa_dlclose(handle); throw std::runtime_error("missing symbol 'sdoa_module_register'"); }
            auto build = [](const nlohmann::json& obj, const char* key, std::vector<std::string>& store, std::vector<const char*>& ptrs) {
                if (obj.contains(key) && obj[key].is_array()) for (const auto& v : obj[key]) if (v.is_string()) store.push_back(v.get<std::string>());
                for (const auto& s2 : store) ptrs.push_back(s2.c_str()); ptrs.push_back(nullptr);
            };
            std::vector<std::string> fs_s, net_s, env_s; std::vector<const char*> fs_p, net_p, env_p;
            build(lm.sandbox, "filesystem", fs_s, fs_p); build(lm.sandbox, "network", net_s, net_p); build(lm.sandbox, "env", env_s, env_p);
            sdoa_module_env menv{ fs_p.data(), net_p.data(), env_p.data() };
            // 6.3: namespaced registration for versioned loads.
            h->impl->set_load_namespace(ns_id);
            SDOA_Status rc = reg(h, &menv);
            h->impl->set_load_namespace("");
            if (rc != SDOA_OK) { sdoa_dlclose(handle); throw std::runtime_error("sdoa_module_register returned error code " + std::to_string(rc)); }
            lm.handle = handle; lm.loaded = true;
            const std::string reg_id = lm.id;  // key prefix capabilities registered under
            for (const auto& cap : lm.capabilities) {
                fs::path cf = d / "capabilities" / (cap + ".json");
                if (!fs::exists(cf)) continue;
                try { std::ifstream cif(cf); nlohmann::json cj; cif >> cj;
                    std::optional<nlohmann::json> in_s, out_s;
                    if (cj.contains("input_schema")  && cj["input_schema"].is_object())  in_s  = cj["input_schema"];
                    if (cj.contains("output_schema") && cj["output_schema"].is_object()) out_s = cj["output_schema"];
                    if (in_s || out_s) h->impl->set_capability_schema(reg_id, cap, std::move(in_s), std::move(out_s));
                } catch (...) {}
            }
            auto truthy = [&](const char* k){ return lm.sandbox.contains(k) &&
                ((lm.sandbox[k].is_boolean() && lm.sandbox[k].get<bool>()) || (lm.sandbox[k].is_array() && !lm.sandbox[k].empty()) ||
                 (lm.sandbox[k].is_string() && lm.sandbox[k].get<std::string>() == "read-write")); };
            uint32_t derived = 0;
            if (truthy("clock") || truthy("random")) derived |= sdoa::CAP_NONDETERMINISTIC;
            if (truthy("network")) derived |= sdoa::CAP_NETWORK;
            if (derived) for (const auto& cap : lm.capabilities) h->impl->set_capability_flags(reg_id, cap, derived);
        } catch (const std::exception& e) { lm.error = e.what(); lm.loaded = false; h->impl->set_load_namespace(""); }
        h->modules.push_back(std::move(lm));
    };

    std::vector<fs::path> dirs;
    for (const auto& e : fs::directory_iterator(root, ec)) if (e.is_directory()) dirs.push_back(e.path());
    std::sort(dirs.begin(), dirs.end());

    for (const auto& d : dirs) {
        const std::string id = d.filename().string();
        nlohmann::json ent = entry_for(id);
        if (fs::exists(d / "module.json")) {
            // legacy flat single-version module
            if (ent.value("state", std::string("active")) == "disabled") continue;
            load_one(d, "");
        } else {
            // 6.3 per-version: modules/<id>/<version>/
            std::vector<std::string> active;
            std::vector<fs::path> vdirs;
            for (const auto& v : fs::directory_iterator(d, ec)) if (v.is_directory() && fs::exists(v.path() / "module.json")) vdirs.push_back(v.path());
            std::sort(vdirs.begin(), vdirs.end());
            for (const auto& vd : vdirs) {
                const std::string ver = vd.filename().string();
                std::string st = "active";
                if (ent.contains("versions") && ent["versions"].contains(ver)) st = ent["versions"][ver].value("state", std::string("active"));
                if (st == "disabled") continue;
                load_one(vd, id + "@" + ver);
                active.push_back(ver);
            }
            if (!active.empty()) {
                std::string hi = active[0];
                for (const auto& v : active) if (vercmp(v, hi) > 0) hi = v;
                h->impl->alias_module(id + "@" + hi, id);  // plain id -> highest active version
            }
        }
    }
    return SDOA_OK;
}

SDOA_API SDOA_Status sdoa_engine_modules_json(SDOA_EngineHandle h, char* buffer, size_t buffer_size, size_t* out_required_size) {
    if (!h) return SDOA_ERR_INVALID_ARGUMENT;
    try {
        nlohmann::json arr = nlohmann::json::array();
        for (const auto& m : h->modules) {
            arr.push_back({
                {"id", m.id}, {"version", m.version}, {"language", m.language},
                {"path", m.path}, {"capabilities", m.capabilities},
                {"sandbox", m.sandbox}, {"loaded", m.loaded}, {"error", m.error}
            });
        }
        const std::string s = arr.dump();
        if (out_required_size) *out_required_size = s.size() + 1;
        if (buffer && buffer_size > 0) {
            size_t n = std::min(buffer_size - 1, s.size());
            std::memcpy(buffer, s.data(), n);
            buffer[n] = '\0';
        }
        return SDOA_OK;
    } catch (...) { return SDOA_ERR_INTERNAL; }
}


SDOA_API SDOA_Status sdoa_engine_register_foreign_capability_v3(SDOA_EngineHandle h, const sdoa_cap_desc_v3* d) {
    if (!h || !d) return SDOA_ERR_INVALID_ARGUMENT;
    sdoa_cap_desc base{ d->module, d->capability, d->fn, d->user_data, d->flags };
    if (!validate_sdoa_compliance(&base)) return SDOA_ERR_NONCOMPLIANT;
    try {
        sdoa::CapabilityMeta meta;
        meta.flags = d->flags; meta.origin = "foreign"; meta.language = "foreign";
        if (d->input_schema_json) {
            auto j = nlohmann::json::parse(d->input_schema_json);
            if (!j.is_object()) return SDOA_ERR_NONCOMPLIANT;
            meta.input_schema = std::move(j);
        }
        if (d->output_schema_json) {
            auto j = nlohmann::json::parse(d->output_schema_json);
            if (!j.is_object()) return SDOA_ERR_NONCOMPLIANT;
            meta.output_schema = std::move(j);
        }
        h->impl->register_capability(d->module, d->capability, wrap_foreign_fn(d->fn, d->user_data), meta);
        return SDOA_OK;
    } catch (const nlohmann::json::exception&) { return SDOA_ERR_PARSE_FAILED; }
      catch (...) { return SDOA_ERR_INTERNAL; }
}

SDOA_API SDOA_Status sdoa_engine_set_capability_schema(SDOA_EngineHandle h, const char* module, const char* capability, const char* in_json, const char* out_json) {
    if (!h || !module || !capability) return SDOA_ERR_INVALID_ARGUMENT;
    try {
        std::optional<nlohmann::json> in_s, out_s;
        if (in_json)  { auto j = nlohmann::json::parse(in_json);  if (!j.is_object()) return SDOA_ERR_NONCOMPLIANT; in_s  = std::move(j); }
        if (out_json) { auto j = nlohmann::json::parse(out_json); if (!j.is_object()) return SDOA_ERR_NONCOMPLIANT; out_s = std::move(j); }
        h->impl->set_capability_schema(module, capability, std::move(in_s), std::move(out_s));
        return SDOA_OK;
    } catch (const nlohmann::json::exception&) { return SDOA_ERR_PARSE_FAILED; }
      catch (...) { return SDOA_ERR_INTERNAL; }
}

} // extern "C"
