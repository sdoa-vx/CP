// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "sdoa.h"
// type:            "module"
// layer:           4
// runtime:         "C"
// version:         "1.0.0"
// operationalRole: "infrastructure"
// optimization:    { priority: "stability" }
// capabilities:    ["sdoa_get_api_version", "sdoa_engine_create",
//                   "sdoa_engine_destroy", "sdoa_engine_load_model_from_json",
//                   "sdoa_get_last_error"]
// dependencies:    []
// docs:            "Canonical SDOA Engine C ABI — v1 surface.
//                   Opaque handles, flat C functions, explicit contracts.
//                   Versioned and additive. No C++ leaks."
// ============================================================================

#ifndef SDOA_H
#define SDOA_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#if defined(SDOA_STATIC)
  /* Single statically-linked binary (e.g. the Windows sdoa.exe build):
     no dllexport/dllimport, no visibility attribute. */
  #define SDOA_API
#elif defined(_WIN32)
  #ifdef SDOA_ABI_EXPORTS
    #define SDOA_API __declspec(dllexport)
  #else
    #define SDOA_API __declspec(dllimport)
  #endif
#else
  #define SDOA_API __attribute__((visibility("default")))
#endif

/* Opaque handles */
typedef struct SDOA_Engine_* SDOA_EngineHandle;
typedef struct SDOA_Result_* SDOA_ResultHandle;

/* Result codes */
typedef enum {
    SDOA_OK = 0,
    SDOA_ERR_INVALID_ARGUMENT,
    SDOA_ERR_INVALID_STATE,
    SDOA_ERR_PARSE_FAILED,
    SDOA_ERR_MODEL_INVALID,
    SDOA_ERR_NOT_FOUND,
    SDOA_ERR_UNSUPPORTED,
    SDOA_ERR_INTERNAL,
    SDOA_ERR_NONCOMPLIANT,
    SDOA_ERR_NONDETERMINISM_NOT_ALLOWED,
    SDOA_ERR_SANDBOX_UNSAFE_MODULE
} SDOA_Status;

/* Engine flags (SDOA_Config.flags) */
#define SDOA_FLAG_INLINE 1u  /* run pipelines inline on the calling thread (single-threaded hosts) */

/* Configuration */
typedef struct {
    uint32_t api_version;   /* must be 1 */
    uint32_t flags;         /* reserved */
    uint32_t thread_count;  /* 0 = auto */
} SDOA_Config;

/* Versioning */
SDOA_API uint32_t sdoa_get_api_version(void);

/* Engine lifecycle */
SDOA_API SDOA_Status sdoa_engine_create(const SDOA_Config* config, SDOA_EngineHandle* out);
SDOA_API SDOA_Status sdoa_engine_destroy(SDOA_EngineHandle engine);

/* Model Contract */
SDOA_API SDOA_Status sdoa_engine_load_model_from_json(SDOA_EngineHandle engine, const char* json, size_t len);

/* Pipeline Contract */
SDOA_API SDOA_Status sdoa_engine_load_pipelines_from_json(SDOA_EngineHandle engine, const char* json, size_t len);

/* Execution Contract */
SDOA_API SDOA_Status sdoa_engine_run_pipeline(
    SDOA_EngineHandle engine,
    const char* pipeline_id,
    const char* input_json,
    size_t input_len,
    SDOA_ResultHandle* out_result
);

SDOA_API SDOA_Status sdoa_result_to_json(
    SDOA_ResultHandle result,
    char* buffer,
    size_t buffer_size,
    size_t* out_required_size
);

SDOA_API SDOA_Status sdoa_result_destroy(SDOA_ResultHandle result);

/* Error reporting */
SDOA_API SDOA_Status sdoa_get_last_error(SDOA_EngineHandle engine, char* buffer, size_t buffer_size, size_t* out_required);

/* ==========================================================================
 * ABI v2 (additive) — Capability hybrid model
 * --------------------------------------------------------------------------
 * Built-in capabilities are sovereign C++ and installed via the engine.
 * Foreign capabilities (Python/Node/Rust/...) register through a controlled
 * callback ABI: JSON-only across the boundary, explicit determinism flags,
 * crash isolation, and per-ENGINE registration (no global shared state).
 * ========================================================================== */

/* Install the built-in standard library (String, Math, Json, FileSystem,
 * System). fs_root sandboxes the read-only FileSystem caps; pass NULL/"" to
 * register them without a usable root (every FileSystem call then errors). */
SDOA_API SDOA_Status sdoa_engine_install_stdlib(SDOA_EngineHandle engine, const char* fs_root);

/* Opaque JSON handle, backed internally by nlohmann::json. Crosses the
 * foreign-capability boundary so neither side touches the other's memory. */
typedef struct sdoa_json sdoa_json;

/* Parse UTF-8 JSON into a handle. On error returns NULL and, if err_msg is
 * non-NULL, sets *err_msg to a malloc'd message (free with sdoa_string_free). */
SDOA_API sdoa_json* sdoa_json_parse(const char* utf8, const char** err_msg);
/* Serialize a handle to a malloc'd UTF-8 string (free with sdoa_string_free). */
SDOA_API char*      sdoa_json_stringify(const sdoa_json* j);
SDOA_API void       sdoa_json_free(sdoa_json* j);
SDOA_API void       sdoa_string_free(char* s);

/* Foreign capability function. Receives a borrowed input handle (owned by the
 * engine) and must return a NEW handle (engine takes ownership and frees it).
 * Return NULL to signal failure -> surfaces as a STEP_ERROR. To carry a
 * message, return a handle whose JSON is {"__sdoa_error__": "..."} . The
 * foreign side MUST catch its own exceptions; nothing may unwind into C++. */
typedef sdoa_json* (*sdoa_foreign_fn)(const sdoa_json* input, void* user_data);

/* Determinism / side-effect metadata (bitset). */
typedef enum {
    SDOA_CAP_PURE             = 1 << 0, /* no side effects, deterministic   */
    SDOA_CAP_SIDE_EFFECTING   = 1 << 1, /* writes, I/O, external mutation   */
    SDOA_CAP_NONDETERMINISTIC = 1 << 2  /* time, randomness, external state */
} sdoa_cap_flags;

/* Registration descriptor for a foreign capability. */
typedef struct {
    const char*     module;      /* e.g. "PyString" (must NOT be a built-in) */
    const char*     capability;  /* e.g. "template" */
    sdoa_foreign_fn fn;
    void*           user_data;
    uint32_t        flags;       /* OR of sdoa_cap_flags; exactly-one-of rules apply */
} sdoa_cap_desc;

/* Register a foreign capability onto a specific engine. Validates SDOA
 * compliance (non-empty identity; PURE exclusive of the other flags; at least
 * one flag set; no collision with built-in module names) before accepting. */
SDOA_API SDOA_Status sdoa_engine_register_foreign_capability(SDOA_EngineHandle engine, const sdoa_cap_desc* desc);

/* ABI v3 (additive): foreign capability registration carrying optional JSON
 * Schemas. NULL schema fields mean "no schema"; non-NULL must be JSON objects. */
typedef struct {
    const char*     module;
    const char*     capability;
    sdoa_foreign_fn fn;
    void*           user_data;
    uint32_t        flags;
    const char*     input_schema_json;   /* nullable JSON object string */
    const char*     output_schema_json;  /* nullable JSON object string */
} sdoa_cap_desc_v3;

SDOA_API SDOA_Status sdoa_engine_register_foreign_capability_v3(SDOA_EngineHandle engine, const sdoa_cap_desc_v3* desc);

/* Attach/replace JSON Schemas on an already-registered capability (builtin or
 * foreign). Used by the module loader to inject schemas from capabilities/*.json
 * without changing the module's library. NULL args leave that schema unchanged. */
SDOA_API SDOA_Status sdoa_engine_set_capability_schema(SDOA_EngineHandle engine, const char* module, const char* capability, const char* input_schema_json, const char* output_schema_json);

/* Declarative capability manifest as a JSON array string (see registry
 * manifest()). Same buffer protocol as sdoa_result_to_json. */
SDOA_API SDOA_Status sdoa_engine_capabilities_json(SDOA_EngineHandle engine, char* buffer, size_t buffer_size, size_t* out_required_size);

/* ==========================================================================
 * Phase 6 — Module system (dynamic discovery & loading)
 * --------------------------------------------------------------------------
 * A module is a directory with a module.json manifest and a shared library.
 * The engine discovers modules under a search path, dlopen()s each library,
 * and calls its sdoa_module_register entrypoint, which registers the module's
 * capabilities through the same foreign-capability ABI (per-engine).
 * ========================================================================== */

/* Sandbox INTENT passed to a module at registration. NULL-terminated arrays.
 * (Phase 6: intent only — modules are expected to honor it; engine-side
 * enforcement is a later phase.) Any list may be NULL = empty. */
typedef struct {
    const char** fs_allow;   /* allowed filesystem path prefixes */
    const char** net_allow;  /* allowed network hosts */
    const char** env_allow;  /* allowed environment variables */
} sdoa_module_env;

/* Well-known symbol a module's shared library MUST export. It registers the
 * module's capabilities (typically via sdoa_engine_register_foreign_capability)
 * and returns SDOA_OK on success. */
typedef SDOA_Status (*sdoa_module_register_fn)(SDOA_EngineHandle engine, const sdoa_module_env* env);
/* The expected exported symbol name is "sdoa_module_register". */

/* Discover and load every module under `search_path` (each immediate
 * subdirectory containing a module.json). Idempotent per directory is NOT
 * guaranteed; call once per path. Returns SDOA_OK if discovery ran (individual
 * module failures are recorded; see sdoa_engine_modules_json). */
SDOA_API SDOA_Status sdoa_engine_load_modules(SDOA_EngineHandle engine, const char* search_path);

/* JSON array of loaded modules: [{id,version,language,path,capabilities,sandbox,loaded,error}]. */
SDOA_API SDOA_Status sdoa_engine_modules_json(SDOA_EngineHandle engine, char* buffer, size_t buffer_size, size_t* out_required_size);

#ifdef __cplusplus
}
#endif

#endif /* SDOA_H */
