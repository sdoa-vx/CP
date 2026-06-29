// ============================================================================
// SDOA MANIFEST
// id:              "sdoa.cli"
// type:            "tool"
// layer:           4
// runtime:         "C++20"
// version:         "0.2.0"
// operationalRole: "developer_tooling"
// capabilities:    ["sdoa:run:pipeline"]
// dependencies:    ["libsdoa (C ABI)", "schema.hpp", "nlohmann_json"]
// docs:            "SDOA developer CLI (Phase 5.B.2 + Phase R): scaffolding,
//                   validation, manifest introspection, schema-driven codegen,
//                   and pipeline execution (sdoa run). Uses the C ABI for
//                   engine/manifest/module loading and the embedded JSON Schema
//                   validator for validation/codegen."
// last_modified:   "2026-06-25T00:00:00Z"
// ============================================================================
#include "sdoa.h"
#include "runtime/schema.hpp"
#include "pkg.hpp"
#include "dashboard_assets.hpp"
#include "sign.hpp"
#include <cstdlib>
#include <nlohmann/json.hpp>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <iostream>
#include <string>
#include <vector>
#include <optional>
#include <map>
#include <algorithm>
#include <cstdint>

using json = nlohmann::json;
namespace fs = std::filesystem;

// --------------------------------------------------------------------------- util
static int fail(const std::string& msg) { std::cerr << "error: " << msg << "\n"; return 1; }
static bool read_file(const fs::path& p, std::string& out) {
    std::ifstream f(p, std::ios::binary); if (!f) return false;
    std::ostringstream ss; ss << f.rdbuf(); out = ss.str(); return true;
}
static void write_file(const fs::path& p, const std::string& s) {
    if (p.has_parent_path()) fs::create_directories(p.parent_path());
    std::ofstream f(p, std::ios::binary); f << s;
}
static std::optional<json> load_json(const fs::path& p, std::string& err) {
    std::string s; if (!read_file(p, s)) { err = "cannot read " + p.string(); return std::nullopt; }
    try { return json::parse(s); } catch (const std::exception& e) { err = std::string("JSON parse error: ") + e.what(); return std::nullopt; }
}

// Fetch the live capability manifest from an embedded engine (stdlib + modules).
static std::optional<json> get_manifest(const std::string& modules_path, bool with_stdlib, std::string& err) {
    SDOA_Config cfg{1, 0, 1};
    SDOA_EngineHandle e = nullptr;
    if (sdoa_engine_create(&cfg, &e) != SDOA_OK) { err = "engine_create failed"; return std::nullopt; }
    if (with_stdlib) sdoa_engine_install_stdlib(e, nullptr);
    if (!modules_path.empty() && fs::is_directory(modules_path)) sdoa_engine_load_modules(e, modules_path.c_str());
    size_t need = 0; sdoa_engine_capabilities_json(e, nullptr, 0, &need);
    std::vector<char> buf(need); sdoa_engine_capabilities_json(e, buf.data(), buf.size(), &need);
    std::string s(buf.data());
    sdoa_engine_destroy(e);
    try { return json::parse(s); } catch (const std::exception& ex) { err = ex.what(); return std::nullopt; }
}

// Validate that a JSON value is a well-formed schema in our supported subset.
static std::optional<std::string> check_schema_shape(const json& sc, const std::string& where) {
    static const std::vector<std::string> types = {"object","array","string","number","integer","boolean","null"};
    if (!sc.is_object()) return where + ": schema must be an object";
    if (sc.contains("type")) {
        auto& t = sc["type"];
        auto ok = [&](const json& v){ if (!v.is_string()) return false; for (auto& k : types) if (v == k) return true; return false; };
        if (t.is_string()) { if (!ok(t)) return where + ": unknown type '" + t.get<std::string>() + "'"; }
        else if (t.is_array()) { for (auto& v : t) if (!ok(v)) return where + ": unknown type in list"; }
        else return where + ": 'type' must be string or array";
    }
    if (sc.contains("required") && !sc["required"].is_array()) return where + ": 'required' must be an array";
    if (sc.contains("properties")) {
        if (!sc["properties"].is_object()) return where + ": 'properties' must be an object";
        for (auto& [k, sub] : sc["properties"].items()) { auto e = check_schema_shape(sub, where + "/" + k); if (e) return e; }
    }
    if (sc.contains("items")) { auto e = check_schema_shape(sc["items"], where + "/items"); if (e) return e; }
    if (sc.contains("enum") && !sc["enum"].is_array()) return where + ": 'enum' must be an array";
    return std::nullopt;
}

// --------------------------------------------------------------------------- new module
static int cmd_new_module(const std::string& id, const std::string& root) {
    fs::path dir = fs::path(root) / id;
    if (fs::exists(dir)) return fail("module directory already exists: " + dir.string());
    json m = {
        {"id", id}, {"version", "0.1.0"}, {"language", "c"},
        {"entry", "lib/" + id + ".so"},
        {"capabilities", json::array()},
        {"sandbox", {{"filesystem", json::array()}, {"network", json::array()}, {"env", json::array()}}}
    };
    write_file(dir / "module.json", m.dump(2) + "\n");
    std::string stub =
        "#include \"sdoa.h\"\n\n"
        "/* Module entrypoint. Register this module's capabilities here, e.g. with\n"
        "   sdoa_engine_register_foreign_capability(engine, &desc). */\n"
        "SDOA_API SDOA_Status sdoa_module_register(SDOA_EngineHandle engine, const sdoa_module_env* env) {\n"
        "    (void)engine; (void)env;\n"
        "    /* TODO: register capabilities */\n"
        "    return SDOA_OK;\n"
        "}\n";
    write_file(dir / "lib" / (id + ".c"), stub);
    write_file(dir / "capabilities" / ".gitkeep", "");
    std::cout << "created module '" << id << "' at " << dir.string() << "\n";
    std::cout << "  module.json, lib/" << id << ".c (stub), capabilities/\n";
    std::cout << "next: add capabilities with `sdoa new capability " << id << " <cap>`\n";
    return 0;
}

// --------------------------------------------------------------------------- new capability
static int cmd_new_capability(const std::string& mod, const std::string& cap, const std::string& root) {
    fs::path dir = fs::path(root) / mod;
    if (!fs::exists(dir / "module.json")) return fail("module not found: " + (dir / "module.json").string());
    fs::path capfile = dir / "capabilities" / (cap + ".json");
    if (fs::exists(capfile)) return fail("capability file already exists: " + capfile.string());
    json stub = {
        {"capability", cap},
        {"description", ""},
        {"input_schema",  {{"type","object"},{"properties", json::object()},{"required", json::array()}}},
        {"output_schema", {{"type","object"},{"properties", json::object()},{"required", json::array()}}}
    };
    write_file(capfile, stub.dump(2) + "\n");
    std::cout << "created capability stub: " << capfile.string() << "\n";
    std::cout << "next steps:\n";
    std::cout << "  1. register '" << cap << "' in " << mod << "'s module library (sdoa_module_register)\n";
    std::cout << "  2. add \"" << cap << "\" to " << (dir / "module.json").string() << " -> capabilities[]\n";
    return 0;
}

// --------------------------------------------------------------------------- validate module
static int cmd_validate_module(const std::string& path) {
    std::vector<std::string> errors;
    std::string err;
    fs::path dir(path);
    auto mj = load_json(dir / "module.json", err);
    if (!mj) return fail(err);
    const json& m = *mj;
    for (const char* k : {"id", "version", "entry", "capabilities"})
        if (!m.contains(k)) errors.push_back(std::string("module.json missing required field '") + k + "'");
    if (m.contains("capabilities") && m["capabilities"].is_array()) {
        for (const auto& c : m["capabilities"]) {
            if (!c.is_string()) { errors.push_back("capabilities[] entries must be strings"); continue; }
            fs::path cf = dir / "capabilities" / (c.get<std::string>() + ".json");
            if (fs::exists(cf)) {
                std::string cerr;
                auto cj = load_json(cf, cerr);
                if (!cj) errors.push_back(c.get<std::string>() + ".json: " + cerr);
                else {
                    for (const char* sk : {"input_schema", "output_schema"})
                        if (cj->contains(sk)) { auto e = check_schema_shape((*cj)[sk], std::string(c) + "." + sk); if (e) errors.push_back(*e); }
                }
            }
        }
    }
    // entry library existence (optional / warning)
    if (m.contains("entry")) {
        fs::path lib = dir / m["entry"].get<std::string>();
        if (!fs::exists(lib)) std::cout << "warning: entry library not found: " << lib.string() << " (build it before loading)\n";
    }
    if (errors.empty()) { std::cout << "OK: module '" << m.value("id", path) << "' is valid\n"; return 0; }
    std::cerr << "INVALID: " << errors.size() << " error(s) in " << path << "\n";
    for (auto& e : errors) std::cerr << "  - " << e << "\n";
    return 1;
}

// --------------------------------------------------------------------------- validate pipeline
static void scan_refs(const json& v, std::vector<std::string>& refs) {
    if (v.is_string()) { const std::string& s = v.get_ref<const std::string&>(); if (!s.empty() && s[0] == '@') refs.push_back(s); }
    else if (v.is_object()) for (auto& [k, x] : v.items()) scan_refs(x, refs);
    else if (v.is_array()) for (auto& x : v) scan_refs(x, refs);
}
static bool has_refs(const json& v) { std::vector<std::string> r; scan_refs(v, r); return !r.empty(); }

static int validate_one_pipeline(const json& p, const json& manifest_index, std::vector<std::string>& errors) {
    if (!p.contains("id") || !p.contains("steps")) { errors.push_back("pipeline missing 'id' or 'steps'"); return 1; }
    const std::string pid = p.value("id", "?");
    const bool strict = p.value("strict", false);
    const bool allow_nd = p.value("allow_nondeterminism", false);
    std::vector<std::string> step_ids;
    for (const auto& s : p["steps"]) if (s.contains("id")) step_ids.push_back(s["id"].get<std::string>());
    auto is_step = [&](const std::string& id){ for (auto& s : step_ids) if (s == id) return true; return false; };

    for (const auto& s : p["steps"]) {
        const std::string sid = s.value("id", "?");
        const std::string mod = s.value("module_id", "");
        const std::string cap = s.value("capability", "");
        const std::string key = mod + "::" + cap;
        std::string loc = pid + "/" + sid;
        if (!manifest_index.contains(key)) { errors.push_back(loc + ": unknown capability '" + key + "'"); continue; }
        const json& meta = manifest_index[key];
        // 6.1 determinism gate: nondeterministic/network caps need allow_nondeterminism (and not strict).
        bool nd = meta["flags"].value("nondeterministic", false) || meta["flags"].value("network", false);
        if (nd && !(allow_nd && !strict))
            errors.push_back(loc + ": NONDETERMINISM_NOT_ALLOWED — capability '" + key + "' is nondeterministic; set allow_nondeterminism=true");
        // @ref existence
        std::vector<std::string> refs; if (s.contains("input")) scan_refs(s["input"], refs);
        for (auto& r : refs) {
            std::string body = r.substr(1); auto dot = body.find('.');
            std::string target = (dot == std::string::npos) ? body : body.substr(0, dot);
            if (!is_step(target)) errors.push_back(loc + ": reference '" + r + "' targets unknown step '" + target + "'");
        }
        // static input schema validation (only when no @refs to resolve)
        if (s.contains("input") && !has_refs(s["input"]) && meta.contains("input_schema")) {
            if (auto se = sdoa::validate_schema(meta["input_schema"], s["input"]))
                errors.push_back(loc + ": input schema violation at " + se->path + " (expected " + se->expected + ", got " + se->actual + ")");
        }
    }
    // edges reference existing steps
    if (p.contains("edges")) for (const auto& e : p["edges"]) {
        if (!is_step(e.value("source_step", "")) || !is_step(e.value("target_step", "")))
            errors.push_back(pid + ": edge references unknown step");
    }
    return 0;
}

static int cmd_validate_pipeline(const std::string& file, const std::string& modules_path) {
    std::string err;
    auto pj = load_json(file, err);
    if (!pj) return fail(err);
    auto man = get_manifest(modules_path, true, err);
    if (!man) return fail("manifest: " + err);
    json idx = json::object();
    for (const auto& c : *man) idx[c["module"].get<std::string>() + "::" + c["capability"].get<std::string>()] = c;

    std::vector<std::string> errors;
    if (pj->contains("pipelines") && (*pj)["pipelines"].is_array())
        for (const auto& p : (*pj)["pipelines"]) validate_one_pipeline(p, idx, errors);
    else
        validate_one_pipeline(*pj, idx, errors);

    if (errors.empty()) { std::cout << "OK: pipeline file '" << file << "' is valid\n"; return 0; }
    std::cerr << "INVALID: " << errors.size() << " error(s) in " << file << "\n";
    for (auto& e : errors) std::cerr << "  - " << e << "\n";
    return 1;
}

// --------------------------------------------------------------------------- manifest
static int cmd_manifest(const std::string& modules_path, bool with_stdlib) {
    std::string err;
    auto man = get_manifest(modules_path, with_stdlib, err);
    if (!man) return fail("manifest: " + err);
    std::cout << json{{"capabilities", *man}}.dump(2) << "\n";
    return 0;
}

// --------------------------------------------------------------------------- codegen (ts / python / rust)
static std::string ident(std::string s) { for (auto& c : s) if (!isalnum((unsigned char)c)) c = '_'; return s; }
static std::string lower(std::string s) { for (auto& c : s) c = (char)tolower((unsigned char)c); return s; }

struct Prop { std::string name; json schema; bool required; };
static std::vector<Prop> props_of(const json& sc) {
    std::vector<Prop> out;
    std::vector<std::string> req;
    if (sc.contains("required") && sc["required"].is_array()) for (auto& r : sc["required"]) req.push_back(r.get<std::string>());
    std::vector<std::string> seen;
    if (sc.contains("properties") && sc["properties"].is_object())
        for (auto& [k, v] : sc["properties"].items()) {
            bool r = false; for (auto& x : req) if (x == k) r = true;
            out.push_back({k, v, r}); seen.push_back(k);
        }
    for (auto& r : req) { bool s2 = false; for (auto& k : seen) if (k == r) s2 = true; if (!s2) out.push_back({r, json::object(), true}); }
    return out;
}
static std::string schema_type(const json& sc) {
    if (!sc.is_object() || !sc.contains("type")) return "any";
    const auto& t = sc["type"]; return t.is_string() ? t.get<std::string>() : "any";
}

// ---- TypeScript ----
static std::string ts_type(const json& sc) {
    std::string t = schema_type(sc);
    if (t == "string") return "string";
    if (t == "number" || t == "integer") return "number";
    if (t == "boolean") return "boolean";
    if (t == "null") return "null";
    if (t == "array") return (sc.contains("items") ? ts_type(sc["items"]) : std::string("unknown")) + "[]";
    if (t == "object") {
        auto ps = props_of(sc); if (ps.empty()) return "Record<string, unknown>";
        std::string o = "{ "; for (auto& p : ps) o += p.name + (p.required ? ": " : "?: ") + ts_type(p.schema) + "; "; return o + "}";
    }
    return "unknown";
}
static std::string emit_ts(const json& man) {
    std::ostringstream o;
    o << "// Generated by `sdoa codegen ts` - do not edit by hand.\n\n";
    o << "export interface PipelineStep { module: string; capability: string; input: unknown; }\n";
    o << "export interface PipelineDefinition { steps: Record<string, PipelineStep>; }\n\n";
    o << "export class Pipeline {\n  private steps: Record<string, PipelineStep> = {};\n";
    o << "  step(id: string, step: PipelineStep): this { this.steps[id] = step; return this; }\n";
    o << "  build(): PipelineDefinition { return { steps: this.steps }; }\n}\n\n";
    for (const auto& c : man) {
        std::string mod = c["module"].get<std::string>(), cap = c["capability"].get<std::string>();
        std::string base = ident(mod) + "_" + ident(cap);
        std::string in_t = "Record<string, unknown>";
        if (c.contains("input_schema"))  { o << "export interface " << base << "_Input "  << ts_type(c["input_schema"])  << "\n"; in_t = base + "_Input"; }
        if (c.contains("output_schema")) { o << "export interface " << base << "_Output " << ts_type(c["output_schema"]) << "\n"; }
        o << "export function " << lower(base) << "(input: " << in_t << "): PipelineStep {\n";
        o << "  return { module: \"" << mod << "\", capability: \"" << cap << "\", input };\n}\n\n";
    }
    return o.str();
}

// ---- Python ----
static std::string py_type(const json& sc) {
    std::string t = schema_type(sc);
    if (t == "string") return "str";
    if (t == "integer") return "int";
    if (t == "number") return "float";
    if (t == "boolean") return "bool";
    if (t == "array") return "List[Any]";
    if (t == "object") return "Dict[str, Any]";
    return "Any";
}
static std::string emit_py(const json& man) {
    std::ostringstream o;
    o << "# Generated by `sdoa codegen python` - do not edit by hand.\n";
    o << "from dataclasses import dataclass, asdict\n";
    o << "from typing import Any, Optional, List, Dict\n\n";
    o << "class Pipeline:\n    def __init__(self): self._steps: Dict[str, Any] = {}\n";
    o << "    def step(self, id: str, step: Dict[str, Any]) -> \"Pipeline\":\n        self._steps[id] = step; return self\n";
    o << "    def build(self) -> Dict[str, Any]: return {\"steps\": self._steps}\n\n";
    for (const auto& c : man) {
        std::string mod = c["module"].get<std::string>(), cap = c["capability"].get<std::string>();
        std::string base = ident(mod) + "_" + ident(cap);
        bool has_in = c.contains("input_schema");
        if (has_in) {
            o << "@dataclass\nclass " << base << "_Input:\n";
            auto ps = props_of(c["input_schema"]);
            // required first, then optional (dataclass ordering rule)
            std::vector<Prop> req, opt; for (auto& p : ps) (p.required ? req : opt).push_back(p);
            if (req.empty() && opt.empty()) o << "    pass\n";
            for (auto& p : req) o << "    " << p.name << ": " << py_type(p.schema) << "\n";
            for (auto& p : opt) o << "    " << p.name << ": Optional[" << py_type(p.schema) << "] = None\n";
            o << "\n";
        }
        if (has_in) {
            o << "def " << lower(base) << "(inp: \"" << base << "_Input\") -> Dict[str, Any]:\n";
            o << "    return {\"module\": \"" << mod << "\", \"capability\": \"" << cap << "\", \"input\": asdict(inp)}\n\n";
        } else {
            o << "def " << lower(base) << "(inp: Dict[str, Any]) -> Dict[str, Any]:\n";
            o << "    return {\"module\": \"" << mod << "\", \"capability\": \"" << cap << "\", \"input\": inp}\n\n";
        }
    }
    return o.str();
}

// ---- Rust ----
static std::string rs_type(const json& sc) {
    std::string t = schema_type(sc);
    if (t == "string") return "String";
    if (t == "integer") return "i64";
    if (t == "number") return "f64";
    if (t == "boolean") return "bool";
    if (t == "array") return "Vec<serde_json::Value>";
    return "serde_json::Value"; // object/any
}
static std::string emit_rs(const json& man) {
    std::ostringstream o;
    o << "// Generated by `sdoa codegen rust` - do not edit by hand.\n";
    o << "#![allow(non_camel_case_types, dead_code)]\n";
    o << "use serde::{Serialize, Deserialize};\nuse std::collections::BTreeMap;\n\n";
    o << "#[derive(Serialize, Deserialize)]\npub struct PipelineStep { pub module: String, pub capability: String, pub input: serde_json::Value }\n";
    o << "#[derive(Serialize, Deserialize, Default)]\npub struct PipelineDefinition { pub steps: BTreeMap<String, PipelineStep> }\n\n";
    o << "pub struct Pipeline { steps: BTreeMap<String, PipelineStep> }\n";
    o << "impl Pipeline {\n    pub fn new() -> Self { Self { steps: BTreeMap::new() } }\n";
    o << "    pub fn step(mut self, id: &str, step: PipelineStep) -> Self { self.steps.insert(id.to_string(), step); self }\n";
    o << "    pub fn build(self) -> PipelineDefinition { PipelineDefinition { steps: self.steps } }\n}\n\n";
    for (const auto& c : man) {
        std::string mod = c["module"].get<std::string>(), cap = c["capability"].get<std::string>();
        std::string base = ident(mod) + "_" + ident(cap);
        std::string in_t = "serde_json::Value";
        if (c.contains("input_schema")) {
            in_t = base + "_Input";
            o << "#[derive(Serialize, Deserialize)]\npub struct " << base << "_Input {";
            auto ps = props_of(c["input_schema"]);
            for (size_t i = 0; i < ps.size(); ++i) {
                std::string ty = rs_type(ps[i].schema);
                if (!ps[i].required) ty = "Option<" + ty + ">";
                o << (i ? "," : "") << " pub " << ps[i].name << ": " << ty;
            }
            o << " }\n";
        }
        o << "pub fn " << lower(base) << "(input: " << in_t << ") -> PipelineStep {\n";
        o << "    PipelineStep { module: \"" << mod << "\".into(), capability: \"" << cap << "\".into(), input: serde_json::to_value(input).unwrap() }\n}\n\n";
    }
    return o.str();
}

static int cmd_codegen(const std::string& lang, const std::string& outdir, const std::string& modules_path) {
    std::string err;
    auto man = get_manifest(modules_path, true, err);
    if (!man) return fail("manifest: " + err);
    std::string content, fname;
    if (lang == "ts" || lang == "typescript") { content = emit_ts(*man); fname = "sdoa-capabilities.ts"; }
    else if (lang == "py" || lang == "python") { content = emit_py(*man); fname = "sdoa_capabilities.py"; }
    else if (lang == "rs" || lang == "rust")   { content = emit_rs(*man); fname = "sdoa_capabilities.rs"; }
    else return fail("unsupported codegen language '" + lang + "' (supported: ts, python, rust)");
    int typed = 0; for (const auto& c : *man) if (c.contains("input_schema")) typed++;
    fs::path out = fs::path(outdir) / fname;
    write_file(out, content);
    std::cout << "wrote " << out.string() << " (" << man->size() << " capabilities, " << typed << " typed)\n";
    return 0;
}

// --------------------------------------------------------------------------- module packaging (5.B.5)
static bool g_allow_network = false;
static bool g_allow_fs_write = false;
static bool g_allow_unsigned = false;
static std::string g_trust_dir;
static std::string default_trust_dir();  // fwd (defined in signing section)
static nlohmann::json lc_load(const std::string& engine_root);     // fwd (lifecycle section)
static void lc_save(const std::string& engine_root, const nlohmann::json& idx);  // fwd

static std::string default_registry() {
    const char* home = std::getenv("HOME");
    if (!home) home = std::getenv("USERPROFILE");
    return (fs::path(home ? home : ".") / ".sdoa" / "registry").string();
}

static int module_pack_to(const std::string& dir, std::string& out_id, std::string& out_ver, sdoa_pkg::json& out_pkg) {
    std::string err;
    auto files = sdoa_pkg::collect(dir, err);
    if (files.empty()) return fail(err);
    sdoa_pkg::json m;
    for (auto& f : files) if (f.path == "module.json") { try { m = sdoa_pkg::json::parse(f.bytes); } catch (...) { return fail("module.json parse error"); } }
    out_id = m.value("id", ""); out_ver = m.value("version", "0.0.0");
    if (out_id.empty()) return fail("module.json missing 'id'");
    out_pkg = sdoa_pkg::build_package(m, files);
    return 0;
}

static int cmd_module_pack(const std::string& dir, const std::string& outfile) {
    if (cmd_validate_module(dir) != 0) return fail("module failed validation; not packed");
    std::string id, ver; sdoa_pkg::json pkg;
    if (module_pack_to(dir, id, ver, pkg) != 0) return 1;
    std::string out = outfile.empty() ? (id + "-" + ver + ".sdoa") : outfile;
    write_file(out, pkg.dump(2) + "\n");
    std::cout << "packed " << pkg["files"].size() << " files -> " << out
              << " (sha256 " << pkg["digest"]["value"].get<std::string>().substr(0, 12) << "...)\n";
    return 0;
}

static int install_package_file(const std::string& file, const std::string& engine_root) {
    std::string err; auto pj = load_json(file, err); if (!pj) return fail(err);
    const sdoa_pkg::json& pkg = *pj;
    if (pkg.value("sdoa_version", 0) != 1) return fail("not a .sdoa package (sdoa_version != 1)");
    std::string computed;
    if (!sdoa_pkg::verify(pkg, computed))
        return fail("digest mismatch — package is corrupt or tampered");
    auto files = sdoa_pkg::unpack(pkg);
    std::string id = pkg["module"].value("id", ""), ver = pkg["module"].value("version", "");
    // 6.1/6.4 foreign-module install policy (this is POLICY, not syscall sandboxing).
    const auto& mod = pkg["module"];
    auto sb = mod.value("sandbox", sdoa_pkg::json::object());
    auto truthy = [&](const char* k){ return sb.contains(k) && ((sb[k].is_boolean() && sb[k].get<bool>()) || (sb[k].is_array() && !sb[k].empty())); };
    const bool elevated = mod.value("unsafe", false) || truthy("network") || truthy("clock") || truthy("random")
                          || sb.value("fs", std::string("none")) == "read-write";

    // 6.4 signature verification + trust.
    bool trusted = false; std::string sig_key_id, sig_status = "unsigned";
    std::string trust_dir = g_trust_dir.empty() ? default_trust_dir() : g_trust_dir;
    if (pkg.contains("signature") && sdoa_sign::available()) {
        const auto& sig = pkg["signature"];
        sig_key_id = sig.value("key_id", "");
        const std::string sigval = sig.value("value", "");
        const std::string digest_hex = pkg["digest"]["value"].get<std::string>();
        std::string e2; auto pubj = load_json(fs::path(trust_dir) / (sig_key_id + ".pub"), e2);
        if (!pubj) {
            if (g_allow_unsigned) { trusted = true; sig_status = "untrusted-key:" + sig_key_id + " (--allow-unsigned)"; }
            else return fail("SIGNATURE_UNTRUSTED_KEY: key '" + sig_key_id + "' is not trusted (run `sdoa key trust`, or pass --allow-unsigned)");
        } else if (sdoa_sign::verify(digest_hex, sigval, pubj->value("public", ""))) {
            trusted = true; sig_status = "signed+trusted:" + sig_key_id;
        } else {
            return fail("SIGNATURE_INVALID: signature does not verify for key '" + sig_key_id + "'");
        }
    } else if (g_allow_unsigned) {
        trusted = true; sig_status = "unsigned (--allow-unsigned)";
    }

    // Elevated intents require a trusted signature (or a per-intent operator override).
    if (elevated && !trusted) {
        if (mod.value("unsafe", false)) return fail("SANDBOX_UNSAFE_MODULE: '" + id + "' declares unsafe:true; requires a trusted signature");
        if (truthy("clock") || truthy("random")) return fail("SIGNATURE_REQUIRED_FOR_ELEVATED_INTENT: '" + id + "' uses clock/random; sign+trust it (or --allow-unsigned)");
        if (truthy("network") && !g_allow_network) return fail("SIGNATURE_REQUIRED_FOR_ELEVATED_INTENT: '" + id + "' requests network; sign+trust it (or --allow-network)");
        if (sb.value("fs", std::string("none")) == "read-write" && !g_allow_fs_write) return fail("SIGNATURE_REQUIRED_FOR_ELEVATED_INTENT: '" + id + "' requests read-write fs; sign+trust it (or --allow-fs-write)");
    }
    // 6.3 per-version install dir: <engine>/modules/<id>/<version>/
    fs::path target = fs::path(engine_root) / "modules" / id / ver;
    if (fs::exists(target / "module.json")) return fail("module '" + id + "@" + ver + "' already installed");
    for (auto& f : files) write_file(target / f.path, f.bytes);
    if (cmd_validate_module(target.string()) != 0) return fail("installed module failed validation");
    sdoa_pkg::json meta = {{"signed", pkg.contains("signature")}, {"key_id", sig_key_id}, {"trusted", trusted}, {"signature", sig_status}};
    write_file(target / ".sdoa-meta.json", meta.dump(2) + "\n");
    {
        auto idx = lc_load(engine_root);
        if (!idx["modules"].contains(id)) idx["modules"][id] = {{"versions", sdoa_pkg::json::object()}};
        if (!idx["modules"][id].contains("versions")) idx["modules"][id]["versions"] = sdoa_pkg::json::object();
        idx["modules"][id]["versions"][ver] = {{"state", "active"}, {"pinned", false},
                              {"signed", pkg.contains("signature")}, {"trusted", trusted}, {"key_id", sig_key_id}};
        lc_save(engine_root, idx);
    }
    std::cout << "installed '" << id << "@" << ver << "' [" << sig_status << "] -> " << target.string() << "\n";
    return 0;
}

static int cmd_module_install(const std::string& arg, const std::string& engine_root, const std::string& registry) {
    if (fs::exists(arg) && fs::path(arg).extension() == ".sdoa") return install_package_file(arg, engine_root);
    // id[@version] from registry
    std::string id = arg, ver;
    auto at = arg.find('@'); if (at != std::string::npos) { id = arg.substr(0, at); ver = arg.substr(at + 1); }
    if (ver.empty()) {
        std::string err; auto idx = load_json(fs::path(registry) / "index.json", err);
        if (!idx) return fail("registry index not found: " + err);
        if (!(*idx)["modules"].contains(id)) return fail("module '" + id + "' not found in registry");
        ver = (*idx)["modules"][id].value("latest", "");
    }
    fs::path pf = fs::path(registry) / "modules" / id / (ver + ".sdoa");
    if (!fs::exists(pf)) return fail("not in registry: " + id + "@" + ver);
    return install_package_file(pf.string(), engine_root);
}

static int cmd_module_publish(const std::string& dir, const std::string& registry) {
    if (cmd_validate_module(dir) != 0) return fail("module failed validation; not published");
    std::string id, ver; sdoa_pkg::json pkg;
    if (module_pack_to(dir, id, ver, pkg) != 0) return 1;
    fs::path pf = fs::path(registry) / "modules" / id / (ver + ".sdoa");
    write_file(pf, pkg.dump(2) + "\n");
    // update index.json
    fs::path idxp = fs::path(registry) / "index.json";
    sdoa_pkg::json idx; std::string s; if (sdoa_pkg::read_bytes(idxp, s)) { try { idx = sdoa_pkg::json::parse(s); } catch(...){} }
    if (!idx.contains("modules")) idx["modules"] = sdoa_pkg::json::object();
    sdoa_pkg::json mj = pkg["module"];
    auto& ent = idx["modules"][id];
    ent["latest"] = ver;
    if (!ent.contains("versions")) ent["versions"] = sdoa_pkg::json::array();
    bool seen = false; for (auto& v : ent["versions"]) if (v == ver) seen = true; if (!seen) ent["versions"].push_back(ver);
    ent["capabilities"] = mj.value("capabilities", sdoa_pkg::json::array());
    ent["description"] = mj.value("description", "");
    write_file(idxp, idx.dump(2) + "\n");
    std::cout << "published '" << id << "' v" << ver << " -> " << pf.string() << "\n";
    return 0;
}

static int cmd_module_search(const std::string& query, const std::string& registry) {
    std::string err; auto idx = load_json(fs::path(registry) / "index.json", err);
    if (!idx) return fail("registry index not found: " + err);
    int hits = 0;
    auto contains = [&](const std::string& h){ return h.find(query) != std::string::npos; };
    for (auto& [id, ent] : (*idx)["modules"].items()) {
        bool match = query.empty() || contains(id) || contains(ent.value("description", ""));
        if (!match) for (auto& c : ent.value("capabilities", sdoa_pkg::json::array())) if (contains(c.get<std::string>())) match = true;
        if (match) {
            std::cout << id << "@" << ent.value("latest", "?");
            auto caps = ent.value("capabilities", sdoa_pkg::json::array());
            std::cout << "  [";
            for (size_t i = 0; i < caps.size(); ++i) std::cout << (i ? "," : "") << caps[i].get<std::string>();
            std::cout << "]";
            std::string d = ent.value("description", ""); if (!d.empty()) std::cout << "  - " << d;
            std::cout << "\n"; hits++;
        }
    }
    if (!hits) std::cout << "no modules match '" << query << "'\n";
    return 0;
}

// --------------------------------------------------------------------------- module lifecycle (6.2)
static fs::path lc_index_path(const std::string& engine_root) { return fs::path(engine_root) / "modules" / "index.json"; }
static sdoa_pkg::json lc_load(const std::string& engine_root) {
    std::string e; auto j = load_json(lc_index_path(engine_root), e);
    if (j && j->contains("modules")) return *j;
    sdoa_pkg::json x; x["modules"] = sdoa_pkg::json::object(); return x;
}
static void lc_save(const std::string& engine_root, const sdoa_pkg::json& idx) {
    write_file(lc_index_path(engine_root), idx.dump(2) + "\n");
}
static std::string strip_version(const std::string& arg) { auto at = arg.find('@'); return at == std::string::npos ? arg : arg.substr(0, at); }
static void parse_ref(const std::string& arg, std::string& id, std::string& ver) {
    auto at = arg.find('@'); if (at == std::string::npos) { id = arg; ver.clear(); } else { id = arg.substr(0, at); ver = arg.substr(at + 1); }
}
// Ensure a nested index entry exists for an installed module (back-fill from per-version dirs).
static bool lc_ensure(sdoa_pkg::json& idx, const std::string& engine_root, const std::string& id) {
    if (idx["modules"].contains(id) && idx["modules"][id].contains("versions") && !idx["modules"][id]["versions"].empty()) return true;
    fs::path d = fs::path(engine_root) / "modules" / id;
    if (!fs::is_directory(d)) return false;
    sdoa_pkg::json versions = sdoa_pkg::json::object();
    for (auto& v : fs::directory_iterator(d)) if (v.is_directory() && fs::exists(v.path() / "module.json"))
        versions[v.path().filename().string()] = {{"state","active"},{"pinned",false},{"signed",false},{"trusted",false},{"key_id",""}};
    if (versions.empty()) return false;
    idx["modules"][id] = {{"versions", versions}};
    return true;
}
// Target version keys for an op: a specific version, or all versions when none given.
static std::vector<std::string> lc_targets(const sdoa_pkg::json& idx, const std::string& id, const std::string& ver) {
    std::vector<std::string> out;
    if (!idx["modules"].contains(id) || !idx["modules"][id].contains("versions")) return out;
    if (!ver.empty()) { if (idx["modules"][id]["versions"].contains(ver)) out.push_back(ver); return out; }
    for (auto& [k,_] : idx["modules"][id]["versions"].items()) out.push_back(k);
    return out;
}

// Compare dotted numeric versions: -1 (a<b), 0 (equal), 1 (a>b).
static int version_cmp(const std::string& a, const std::string& b) {
    auto parts = [](const std::string& v) {
        std::vector<long> out; std::string cur;
        for (char c : v) { if (c == '.') { out.push_back(cur.empty()?0:std::stol(cur)); cur.clear(); } else if (isdigit((unsigned char)c)) cur += c; }
        out.push_back(cur.empty()?0:std::stol(cur)); return out;
    };
    auto pa = parts(a), pb = parts(b);
    for (size_t i = 0; i < std::max(pa.size(), pb.size()); ++i) {
        long x = i < pa.size() ? pa[i] : 0, y = i < pb.size() ? pb[i] : 0;
        if (x != y) return x < y ? -1 : 1;
    }
    return 0;
}

// Update: install the registry's latest version ALONGSIDE existing ones (6.3).
static int update_one(const std::string& id, const std::string& engine_root, const std::string& registry, bool verbose) {
    auto idx = lc_load(engine_root);
    if (!idx["modules"].contains(id)) { if (verbose) std::cout << id << ": not installed\n"; return 0; }
    auto vers = idx["modules"][id].value("versions", sdoa_pkg::json::object());
    bool anypin = false; std::string curmax = "0.0.0";
    for (auto& [v, e] : vers.items()) { if (e.value("pinned", false)) anypin = true; if (version_cmp(v, curmax) > 0) curmax = v; }
    if (anypin) { std::cout << id << ": pinned, skipping\n"; return 0; }
    std::string e2; auto ridx = load_json(fs::path(registry) / "index.json", e2);
    if (!ridx || !(*ridx)["modules"].contains(id)) { if (verbose) std::cout << id << ": not in registry\n"; return 0; }
    std::string latest = (*ridx)["modules"][id].value("latest", "");
    if (vers.contains(latest) || version_cmp(latest, curmax) <= 0) { std::cout << id << ": up to date (" << curmax << ")\n"; return 0; }
    fs::path pf = fs::path(registry) / "modules" / id / (latest + ".sdoa");
    if (!fs::exists(pf)) return fail("registry missing artifact " + id + "@" + latest);
    int rc = install_package_file(pf.string(), engine_root);  // adds new version, leaves olds intact
    if (rc != 0) return rc;
    std::cout << "updated " << id << ": " << curmax << " -> " << latest << " (added; older versions kept)\n";
    return 0;
}

static int cmd_module_update(const std::string& arg, const std::string& engine_root, const std::string& registry) {
    if (!arg.empty()) return update_one(strip_version(arg), engine_root, registry, true);
    auto idx = lc_load(engine_root);
    std::vector<std::string> ids; for (auto& [k,_] : idx["modules"].items()) ids.push_back(k);
    std::sort(ids.begin(), ids.end());
    if (ids.empty()) { std::cout << "no modules installed\n"; return 0; }
    int rc = 0; for (auto& id : ids) rc |= update_one(id, engine_root, registry, false);
    return rc;
}

static int cmd_module_list(const std::string& engine_root) {
    auto idx = lc_load(engine_root);
    fs::path md = fs::path(engine_root) / "modules";
    if (fs::is_directory(md)) for (auto& e : fs::directory_iterator(md))
        if (e.is_directory()) lc_ensure(idx, engine_root, e.path().filename().string());
    std::vector<std::string> ids; for (auto& [k,_] : idx["modules"].items()) ids.push_back(k);
    std::sort(ids.begin(), ids.end());
    if (ids.empty()) { std::cout << "no modules installed under " << md.string() << "\n"; return 0; }
    for (auto& id : ids) {
        std::cout << id << "\n";
        auto vers = idx["modules"][id].value("versions", sdoa_pkg::json::object());
        std::vector<std::string> vk; for (auto& [k,_] : vers.items()) vk.push_back(k);
        std::sort(vk.begin(), vk.end());
        for (auto& v : vk) {
            auto& m = vers[v];
            std::string trust = m.value("signed", false) ? (m.value("trusted", false) ? "trusted" : "untrusted") : "unsigned";
            printf("  %-9s %-9s %-8s %-10s\n", v.c_str(), m.value("state","active").c_str(),
                   m.value("pinned", false) ? "pinned" : "-", trust.c_str());
        }
    }
    return 0;
}

static int cmd_module_remove(const std::string& arg, const std::string& engine_root) {
    std::string id, ver; parse_ref(arg, id, ver);
    auto idx = lc_load(engine_root);
    lc_ensure(idx, engine_root, id);
    if (!idx["modules"].contains(id) && !fs::exists(fs::path(engine_root) / "modules" / id)) return fail("module '" + id + "' is not installed");
    std::error_code ec;
    if (ver.empty()) {                                   // remove the whole module (all versions)
        fs::remove_all(fs::path(engine_root) / "modules" / id, ec);
        idx["modules"].erase(id);
        std::cout << "removed '" << id << "' (all versions)\n";
    } else {                                             // remove one version
        fs::remove_all(fs::path(engine_root) / "modules" / id / ver, ec);
        if (idx["modules"].contains(id)) idx["modules"][id]["versions"].erase(ver);
        if (idx["modules"].contains(id) && idx["modules"][id]["versions"].empty()) {
            idx["modules"].erase(id); fs::remove_all(fs::path(engine_root) / "modules" / id, ec);
        }
        std::cout << "removed '" << id << "@" << ver << "'\n";
    }
    lc_save(engine_root, idx);
    return 0;
}

static int cmd_module_state(const std::string& arg, const std::string& engine_root, const std::string& state) {
    std::string id, ver; parse_ref(arg, id, ver);
    auto idx = lc_load(engine_root);
    if (!lc_ensure(idx, engine_root, id)) return fail("module '" + id + "' is not installed");
    auto targets = lc_targets(idx, id, ver);
    if (targets.empty()) return fail("no matching version of '" + id + "'");
    for (auto& v : targets) idx["modules"][id]["versions"][v]["state"] = state;
    lc_save(engine_root, idx);
    for (auto& v : targets) std::cout << id << "@" << v << " is now " << state << "\n";
    return 0;
}

static int cmd_module_pin(const std::string& arg, const std::string& engine_root, bool pinned) {
    std::string id, ver; parse_ref(arg, id, ver);
    auto idx = lc_load(engine_root);
    if (!lc_ensure(idx, engine_root, id)) return fail("module '" + id + "' is not installed");
    auto targets = lc_targets(idx, id, ver);
    if (targets.empty()) return fail("no matching version of '" + id + "'");
    for (auto& v : targets) idx["modules"][id]["versions"][v]["pinned"] = pinned;
    lc_save(engine_root, idx);
    for (auto& v : targets) std::cout << id << "@" << v << (pinned ? " pinned" : " unpinned") << "\n";
    return 0;
}

// --------------------------------------------------------------------------- signing (6.4)
static std::string default_trust_dir() {
    const char* home = std::getenv("HOME"); if (!home) home = std::getenv("USERPROFILE");
    return (fs::path(home ? home : ".") / ".sdoa" / "trust" / "keys").string();
}

static int cmd_key_generate(const std::string& key_id, const std::string& outfile) {
    std::string pub, sk;
    if (!sdoa_sign::keypair(pub, sk)) return fail("keypair generation failed (libsodium unavailable?)");
    sdoa_pkg::json k = {{"key_id", key_id}, {"algorithm", "ed25519"}, {"public", pub}, {"secret", sk}};
    std::string out = outfile.empty() ? (key_id + ".key") : outfile;
    write_file(out, k.dump(2) + "\n");
    std::cout << "generated ed25519 key '" << key_id << "' -> " << out << " (keep the secret private)\n";
    std::cout << "public: " << pub << "\n";
    return 0;
}

static int cmd_key_trust(const std::string& file, const std::string& trust_dir) {
    std::string err; auto kj = load_json(file, err); if (!kj) return fail(err);
    std::string key_id = kj->value("key_id", ""), pub = kj->value("public", "");
    if (key_id.empty() || pub.empty()) return fail("key file missing key_id/public");
    sdoa_pkg::json pubrec = {{"key_id", key_id}, {"algorithm", "ed25519"}, {"public", pub}};
    write_file(fs::path(trust_dir) / (key_id + ".pub"), pubrec.dump(2) + "\n");
    std::cout << "trusted key '" << key_id << "' -> " << (fs::path(trust_dir) / (key_id + ".pub")).string() << "\n";
    return 0;
}

static int cmd_module_sign(const std::string& file, const std::string& keyfile, const std::string& outfile) {
    std::string err; auto pj = load_json(file, err); if (!pj) return fail(err);
    sdoa_pkg::json pkg = *pj;
    if (pkg.value("sdoa_version", 0) != 1) return fail("not a .sdoa package");
    std::string computed;
    if (!sdoa_pkg::verify(pkg, computed)) return fail("digest mismatch; refusing to sign a corrupt package");
    auto kj = load_json(keyfile, err); if (!kj) return fail(err);
    std::string key_id = kj->value("key_id", ""), sk = kj->value("secret", "");
    if (key_id.empty() || sk.empty()) return fail("key file missing key_id/secret");
    std::string digest_hex = pkg["digest"]["value"].get<std::string>();
    std::string sig = sdoa_sign::sign(digest_hex, sk);
    if (sig.empty()) return fail("signing failed");
    pkg["signature"] = {{"algorithm", "ed25519"}, {"key_id", key_id}, {"value", sig}};
    std::string id = pkg["module"].value("id", "module"), ver = pkg["module"].value("version", "0.0.0");
    std::string out = outfile.empty() ? (id + "-" + ver + ".signed.sdoa") : outfile;
    write_file(out, pkg.dump(2) + "\n");
    std::cout << "signed '" << id << "' v" << ver << " with key '" << key_id << "' -> " << out << "\n";
    return 0;
}

// --------------------------------------------------------------------------- dashboard (5.B.6)
// Collect installed modules under <engine>/modules and registry modules.
static sdoa_pkg::json collect_modules_json(const std::string& engine_root, const std::string& registry) {
    sdoa_pkg::json out; out["installed"] = sdoa_pkg::json::array(); out["registry"] = sdoa_pkg::json::array();
    fs::path md = fs::path(engine_root) / "modules";
    sdoa_pkg::json li; { std::string lcs; if (sdoa_pkg::read_bytes(md / "index.json", lcs)) { try { li = sdoa_pkg::json::parse(lcs); } catch(...){} } }
    if (fs::is_directory(md)) {
        std::vector<fs::path> dirs; for (auto& e : fs::directory_iterator(md)) if (e.is_directory()) dirs.push_back(e.path());
        std::sort(dirs.begin(), dirs.end());
        for (auto& d : dirs) {
            const std::string idv = d.filename().string();
            // per-version dirs: <id>/<version>/module.json  (also tolerate legacy flat <id>/module.json)
            std::vector<fs::path> vdirs;
            if (fs::exists(d / "module.json")) vdirs.push_back(d);
            else for (auto& v : fs::directory_iterator(d)) if (v.is_directory() && fs::exists(v.path() / "module.json")) vdirs.push_back(v.path());
            std::sort(vdirs.begin(), vdirs.end());
            for (auto& vd : vdirs) {
                std::string s2; if (!sdoa_pkg::read_bytes(vd / "module.json", s2)) continue;
                try { auto m = sdoa_pkg::json::parse(s2);
                    std::string ver = m.value("version","");
                    sdoa_pkg::json entry = {{"id", idv}, {"version", ver},
                        {"capabilities", m.value("capabilities", sdoa_pkg::json::array())}, {"sandbox", m.value("sandbox", sdoa_pkg::json::object())}};
                    if (li.contains("modules") && li["modules"].contains(idv) && li["modules"][idv].contains("versions")
                        && li["modules"][idv]["versions"].contains(ver)) {
                        auto& e2 = li["modules"][idv]["versions"][ver];
                        entry["state"] = e2.value("state","active"); entry["pinned"] = e2.value("pinned",false);
                        entry["signed"] = e2.value("signed",false); entry["trusted"] = e2.value("trusted",false);
                    }
                    out["installed"].push_back(entry);
                } catch(...){}
            }
        }
    }
    std::string idxs; if (sdoa_pkg::read_bytes(fs::path(registry) / "index.json", idxs)) {
        try { auto idx = sdoa_pkg::json::parse(idxs);
            if (idx.contains("modules")) {
                std::vector<std::string> ids; for (auto& [k,_] : idx["modules"].items()) ids.push_back(k);
                std::sort(ids.begin(), ids.end());
                for (auto& id : ids) { auto& e = idx["modules"][id];
                    out["registry"].push_back({{"id", id}, {"version", e.value("latest","")},
                        {"capabilities", e.value("capabilities", sdoa_pkg::json::array())}, {"description", e.value("description","")}});
                }
            }
        } catch(...){}
    }
    return out;
}

static int cmd_dashboard(const std::string& outdir, const std::string& engine_root, const std::string& registry, const std::string& traces_dir) {
    std::string err;
    auto man = get_manifest((fs::path(engine_root) / "modules").string(), true, err);
    if (!man) return fail("manifest: " + err);
    sdoa_pkg::json manifest; manifest["capabilities"] = *man;
    sdoa_pkg::json modules = collect_modules_json(engine_root, registry);

    // traces: copy *.json and build {list, data} (data inlined for offline use).
    sdoa_pkg::json traces; traces["list"] = sdoa_pkg::json::array(); traces["data"] = sdoa_pkg::json::object();
    if (!traces_dir.empty() && fs::is_directory(traces_dir)) {
        std::vector<fs::path> tf; for (auto& e : fs::directory_iterator(traces_dir)) if (e.path().extension() == ".json") tf.push_back(e.path());
        std::sort(tf.begin(), tf.end());
        for (auto& t : tf) {
            std::string s2; if (!sdoa_pkg::read_bytes(t, s2)) continue;
            std::string name = t.filename().string();
            try { traces["data"][name] = sdoa_pkg::json::parse(s2); traces["list"].push_back(name);
                  write_file(fs::path(outdir) / "traces" / name, s2); } catch(...){}
        }
    }
    write_file(fs::path(outdir) / "traces" / "index.json", traces["list"].dump(2) + "\n");

    // data files (spec) + inlined data.js (offline) + static assets.
    write_file(fs::path(outdir) / "manifest.json", manifest.dump(2) + "\n");
    write_file(fs::path(outdir) / "modules.json", modules.dump(2) + "\n");
    sdoa_pkg::json embed; embed["manifest"] = manifest; embed["modules"] = modules; embed["traces"] = traces;
    write_file(fs::path(outdir) / "data.js", "window.SDOA_EMBED = " + embed.dump() + ";\n");
    write_file(fs::path(outdir) / "index.html", sdoa_dash::INDEX_HTML);
    write_file(fs::path(outdir) / "dashboard.js", sdoa_dash::DASHBOARD_JS);
    write_file(fs::path(outdir) / "dashboard.css", sdoa_dash::DASHBOARD_CSS);

    std::cout << "dashboard written to " << outdir << " ("
              << (*man).size() << " capabilities, " << modules["installed"].size() << " installed modules, "
              << traces["list"].size() << " traces)\n";
    std::cout << "open " << (fs::path(outdir) / "index.html").string() << " in a browser\n";
    return 0;
}

// --------------------------------------------------------------------------- docs (5.B.7.1)
static std::string md_schema(const json& sc) {
    auto ps = props_of(sc);
    if (ps.empty()) return "_no declared fields_\n";
    std::string o = "| field | type | required |\n|---|---|---|\n";
    for (auto& p : ps) o += "| `" + p.name + "` | " + schema_type(p.schema) + " | " + (p.required ? "yes" : "") + " |\n";
    return o;
}
static std::string md_examples(const json& c) {
    std::string mod = c["module"].get<std::string>(), cap = c["capability"].get<std::string>();
    std::string base = ident(mod) + "_" + ident(cap), fn = lower(base);
    std::vector<std::string> props;
    if (c.contains("input_schema")) for (auto& p : props_of(c["input_schema"])) props.push_back(p.name);
    std::string tsArgs, pyArgs, rsArgs;
    for (size_t i = 0; i < props.size(); ++i) {
        tsArgs += (i ? ", " : "") + props[i] + ": ...";
        pyArgs += (i ? ", " : "") + props[i] + "=...";
        rsArgs += (i ? ", " : "") + props[i] + ": ...";
    }
    std::string o;
    o += "```ts\n" + fn + "({ " + tsArgs + " })\n```\n";
    o += "```python\n" + fn + "(" + base + "_Input(" + pyArgs + "))\n```\n";
    o += "```rust\n" + fn + "(" + base + "_Input { " + rsArgs + " })\n```\n";
    return o;
}

static int cmd_docs(const std::string& outdir, const std::string& modules_path) {
    std::string err;
    auto man = get_manifest(modules_path, true, err);
    if (!man) return fail("manifest: " + err);
    // group by module (sorted)
    std::map<std::string, std::vector<json>> groups;
    for (const auto& c : *man) groups[c["module"].get<std::string>()].push_back(c);

    // index.md
    std::ostringstream idx;
    idx << "# SDOA Capability Reference\n\nAuto-generated from the engine manifest ("
        << man->size() << " capabilities across " << groups.size() << " modules).\n\n";
    for (auto& [mod, caps] : groups) {
        idx << "## [" << mod << "](modules/" << mod << ".md) (" << caps.size() << ")\n\n";
        std::vector<std::string> names; for (auto& c : caps) names.push_back(c["capability"].get<std::string>());
        std::sort(names.begin(), names.end());
        for (auto& n : names) idx << "- [`" << mod << "::" << n << "`](capabilities/" << mod << "." << n << ".md)\n";
        idx << "\n";
    }
    write_file(fs::path(outdir) / "index.md", idx.str());

    int capcount = 0;
    for (auto& [mod, caps] : groups) {
        std::sort(caps.begin(), caps.end(), [](const json& a, const json& b){ return a["capability"] < b["capability"]; });
        // module page
        std::ostringstream mp;
        mp << "# Module: " << mod << "\n\n| capability | flags |\n|---|---|\n";
        for (auto& c : caps) {
            auto f = c["flags"];
            std::string fl;
            for (const char* k : {"pure","side_effecting","nondeterministic"}) if (f.value(k, false)) fl += (fl.empty()?"":", ") + std::string(k);
            mp << "| [`" << c["capability"].get<std::string>() << "`](../capabilities/" << mod << "." << c["capability"].get<std::string>() << ".md) | " << fl << " |\n";
        }
        write_file(fs::path(outdir) / "modules" / (mod + ".md"), mp.str());
        // capability pages + schema files
        for (auto& c : caps) {
            std::string cap = c["capability"].get<std::string>();
            auto f = c["flags"]; std::string fl;
            for (const char* k : {"pure","side_effecting","nondeterministic"}) if (f.value(k, false)) fl += (fl.empty()?"":", ") + std::string(k);
            std::ostringstream cp;
            cp << "# `" << mod << "::" << cap << "`\n\n";
            cp << "- **origin:** " << c.value("origin","") << "\n- **language:** " << c.value("language","") << "\n- **flags:** " << (fl.empty()?"(none)":fl) << "\n\n";
            cp << "## Input\n\n" << (c.contains("input_schema") ? md_schema(c["input_schema"]) : std::string("_no schema_\n")) << "\n";
            cp << "## Output\n\n" << (c.contains("output_schema") ? md_schema(c["output_schema"]) : std::string("_no schema_\n")) << "\n";
            cp << "## Examples\n\n" << md_examples(c) << "\n";
            cp << "[schema json](../schemas/" << mod << "." << cap << ".json)\n";
            write_file(fs::path(outdir) / "capabilities" / (mod + "." + cap + ".md"), cp.str());
            json sch;
            if (c.contains("input_schema")) sch["input_schema"] = c["input_schema"];
            if (c.contains("output_schema")) sch["output_schema"] = c["output_schema"];
            write_file(fs::path(outdir) / "schemas" / (mod + "." + cap + ".json"), sch.dump(2) + "\n");
            capcount++;
        }
    }
    std::cout << "docs written to " << outdir << " (" << groups.size() << " modules, " << capcount << " capabilities)\n";
    return 0;
}

// --------------------------------------------------------------------------- run
// cmd_run: Phase R — execute a pipeline and emit the run-contract JSON.
//
// Input file shapes accepted:
//   1. Single pipeline object  { "id": "P", "steps": [...], "edges": [...] }
//   2. Pipelines bag           { "pipelines": [...] }
//
// Auto-generates a minimal model doc from the module IDs found in steps so the
// caller never has to supply one separately.
//
// Output (stdout):
//   { "ok": true,  "pipeline_id": "P", "outputs": {...}, "trace": [...] }
//   { "ok": false, "pipeline_id": "P", "error": { "code": "...", "details": "..." }, "trace": [...] }
static int cmd_run(
    const std::string& pipeline_file,
    const std::string& input_file,
    const std::string& modules_path,
    const std::string& select_id,
    bool with_stdlib,
    bool strict_mode,
    bool emit_trace,
    bool inline_exec
) {
    // --- load pipeline file ---------------------------------------------------
    std::string raw_err;
    auto pj = load_json(fs::path(pipeline_file), raw_err);
    if (!pj) return fail("cannot load pipeline file: " + raw_err);

    // --- resolve target pipeline object --------------------------------------
    json target_pipeline;
    if (pj->contains("pipelines") && (*pj)["pipelines"].is_array()) {
        // bag format: pick by --pipeline id, else first
        const json& bag = (*pj)["pipelines"];
        if (bag.empty()) return fail("pipeline file contains an empty 'pipelines' array");
        if (!select_id.empty()) {
            bool found = false;
            for (const auto& p : bag) {
                if (p.value("id", "") == select_id) { target_pipeline = p; found = true; break; }
            }
            if (!found) return fail("pipeline '" + select_id + "' not found in file");
        } else {
            target_pipeline = bag[0];
        }
    } else if (pj->contains("steps")) {
        // single pipeline object
        target_pipeline = *pj;
    } else {
        return fail("pipeline file must contain a pipeline object ({\"id\":\"P\",\"steps\":[...]}) or a bag ({\"pipelines\":[...]})");
    }

    const std::string pid = target_pipeline.value("id", "pipeline");

    // Apply --strict flag onto the pipeline object before submission
    if (strict_mode) target_pipeline["strict"] = true;

    // --- model doc (auto-generated from steps) --------------------------------
    // Both the model validator (≥1 capability per module) and the pipeline
    // validator (step module+cap must exist in model index) require a model doc
    // that mirrors the pipeline's declared modules and capabilities.
    // We synthesize the minimal valid doc by scanning steps — this is purely
    // structural metadata; runtime routing uses the live capability registry.
    std::map<std::string, std::vector<std::string>> mod_caps;  // module_id → [caps]
    if (target_pipeline.contains("steps") && target_pipeline["steps"].is_array()) {
        for (const auto& s : target_pipeline["steps"]) {
            std::string mid = s.value("module_id", "");
            std::string cap = s.value("capability", "");
            if (!mid.empty() && !cap.empty()) {
                auto& caps = mod_caps[mid];
                if (std::find(caps.begin(), caps.end(), cap) == caps.end())
                    caps.push_back(cap);
            }
        }
    }
    json model_modules = json::array();
    for (const auto& [mid, caps] : mod_caps) {
        json cap_arr = json::array();
        for (const auto& c : caps) cap_arr.push_back({{ "name", c }});
        model_modules.push_back({{ "id", mid }, { "capabilities", cap_arr },
                                  { "dependencies", json::array() }, { "invariants", json::array() }});
    }
    json model_doc = {{ "domains", json::array({{ {{ "id", "auto" }, { "modules", model_modules } }} }) }};

    // --- load optional input -------------------------------------------------
    json input_data = json::object();
    if (!input_file.empty()) {
        auto ij = load_json(fs::path(input_file), raw_err);
        if (!ij) return fail("cannot load input file: " + raw_err);
        if (!ij->is_object()) return fail("input file must be a JSON object");
        input_data = *ij;
    }

    // --- create engine -------------------------------------------------------
    uint32_t flags = inline_exec ? SDOA_FLAG_INLINE : 0u;
    SDOA_Config cfg{ 1, flags, 1 };
    SDOA_EngineHandle eng = nullptr;
    if (sdoa_engine_create(&cfg, &eng) != SDOA_OK)
        return fail("engine_create failed");

    if (with_stdlib) sdoa_engine_install_stdlib(eng, nullptr);
    if (!modules_path.empty() && fs::is_directory(modules_path))
        sdoa_engine_load_modules(eng, modules_path.c_str());

    // --- load model + pipeline -----------------------------------------------
    std::string model_str = model_doc.dump();
    std::cerr << "[dbg] model_doc: " << model_str << "\n";
    if (sdoa_engine_load_model_from_json(eng, model_str.c_str(), model_str.size()) != SDOA_OK) {
        size_t errsz = 0;
        sdoa_get_last_error(eng, nullptr, 0, &errsz);
        std::string errbuf(errsz, '\0');
        sdoa_get_last_error(eng, errbuf.data(), errbuf.size(), &errsz);
        sdoa_engine_destroy(eng);
        return fail("failed to load auto-generated model doc: " + errbuf);
    }

    json pipelines_doc = {{ "pipelines", json::array({ target_pipeline }) }};
    std::string pipes_str = pipelines_doc.dump();
    if (sdoa_engine_load_pipelines_from_json(eng, pipes_str.c_str(), pipes_str.size()) != SDOA_OK) {
        sdoa_engine_destroy(eng);
        return fail("failed to load pipeline (check validate pipeline for details)");
    }

    // --- execute -------------------------------------------------------------
    std::string input_str = input_data.dump();
    SDOA_ResultHandle result = nullptr;
    SDOA_Status run_status = sdoa_engine_run_pipeline(
        eng, pid.c_str(), input_str.c_str(), input_str.size(), &result);

    // Retrieve result JSON regardless of status (trace is in there on failure too)
    json out_obj;
    if (result) {
        size_t need = 0;
        sdoa_result_to_json(result, nullptr, 0, &need);
        std::vector<char> rbuf(need);
        sdoa_result_to_json(result, rbuf.data(), rbuf.size(), &need);
        sdoa_result_destroy(result);
        try { out_obj = json::parse(std::string(rbuf.data())); } catch (...) {}
    }
    sdoa_engine_destroy(eng);

    // --- build run-contract output -------------------------------------------
    json contract;
    contract["pipeline_id"] = pid;

    if (run_status == SDOA_OK && out_obj.value("success", false)) {
        contract["ok"] = true;
        contract["outputs"] = out_obj.value("outputs", json::object());
    } else {
        contract["ok"] = false;
        std::string err_msg = out_obj.value("error", std::string("execution failed"));
        contract["error"] = {{ "code", "PIPELINE_FAILED" }, { "details", err_msg }};
    }

    if (emit_trace && out_obj.contains("trace"))
        contract["trace"] = out_obj["trace"];

    std::cout << contract.dump(2) << "\n";
    return contract["ok"].get<bool>() ? 0 : 1;
}

// --------------------------------------------------------------------------- main
static int usage() {
    std::cout <<
        "sdoa — SDOA developer CLI\n\n"
        "  sdoa new module <id> [--dir modules]\n"
        "  sdoa new capability <module> <cap> [--dir modules]\n"
        "  sdoa validate module <path>\n"
        "  sdoa validate pipeline <file> [--modules <dir>]\n"
        "  sdoa manifest [--modules <dir>] [--no-stdlib]\n"
        "  sdoa codegen <lang> <outdir> [--modules <dir>]   (lang: ts|python|rust)\n"
        "  sdoa module pack <dir> [-o <file.sdoa>]\n"
        "  sdoa module install <file.sdoa|id@version> [--engine <dir>] [--registry <dir>]\n"
        "  sdoa module publish <dir> [--registry <dir>]\n"
        "  sdoa module search <query> [--registry <dir>]\n"
        "  sdoa module list | remove <id> | disable <id> | enable <id> | pin <id> | unpin <id> [--engine <dir>]\n"
        "  sdoa module update [<id>] [--engine <dir>] [--registry <dir>]   (honors pinned)\n"
        "  sdoa module sign <file.sdoa> --key <key.key> [-o <out>]\n"
        "  sdoa key generate <key_id> [-o <file.key>]\n"
        "  sdoa key trust <key.key|.pub> [--trust <dir>]\n"
        "  sdoa dashboard <outdir> [--engine <dir>] [--traces <dir>] [--registry <dir>]\n"
        "  sdoa docs <outdir> [--modules <dir>]\n"
        "  sdoa run <pipeline.json> [--input in.json] [--modules <dir>] [--pipeline <id>]\n"
        "           [--strict] [--trace] [--inline] [--no-stdlib]\n";
    return 0;
}
static std::string opt(int argc, char** argv, const std::string& name, const std::string& def) {
    for (int i = 0; i < argc - 1; ++i) if (name == argv[i]) return argv[i + 1];
    return def;
}
static bool flag(int argc, char** argv, const std::string& name) {
    for (int i = 0; i < argc; ++i) if (name == argv[i]) return true;
    return false;
}

int main(int argc, char** argv) {
    if (argc < 2) return usage();
    std::string cmd = argv[1];
    std::string dir = opt(argc, argv, "--dir", "modules");
    std::string modules = opt(argc, argv, "--modules", "modules");

    if (cmd == "new" && argc >= 4 && std::string(argv[2]) == "module")
        return cmd_new_module(argv[3], dir);
    if (cmd == "new" && argc >= 5 && std::string(argv[2]) == "capability")
        return cmd_new_capability(argv[3], argv[4], dir);
    if (cmd == "validate" && argc >= 4 && std::string(argv[2]) == "module")
        return cmd_validate_module(argv[3]);
    if (cmd == "validate" && argc >= 4 && std::string(argv[2]) == "pipeline")
        return cmd_validate_pipeline(argv[3], modules);
    if (cmd == "key" && argc >= 3) {
        std::string sub = argv[2];
        std::string trust = opt(argc, argv, "--trust", default_trust_dir());
        if (sub == "generate" && argc >= 4) return cmd_key_generate(argv[3], opt(argc, argv, "-o", ""));
        if (sub == "trust" && argc >= 4) return cmd_key_trust(argv[3], trust);
        std::cerr << "usage: sdoa key <generate <id>|trust <keyfile>> [--trust <dir>] [-o <file>]\n"; return 1;
    }
    if (cmd == "module" && argc >= 3) {
        std::string sub = argv[2];
        std::string engine_root = opt(argc, argv, "--engine", ".");
        std::string registry = opt(argc, argv, "--registry", default_registry());
        g_allow_network = flag(argc, argv, "--allow-network");
        g_allow_fs_write = flag(argc, argv, "--allow-fs-write");
        g_allow_unsigned = flag(argc, argv, "--allow-unsigned");
        g_trust_dir = opt(argc, argv, "--trust", default_trust_dir());
        if (sub == "sign" && argc >= 4) return cmd_module_sign(argv[3], opt(argc, argv, "--key", ""), opt(argc, argv, "-o", ""));
        if (sub == "pack" && argc >= 4) return cmd_module_pack(argv[3], opt(argc, argv, "-o", ""));
        if (sub == "install" && argc >= 4) return cmd_module_install(argv[3], engine_root, registry);
        if (sub == "publish" && argc >= 4) return cmd_module_publish(argv[3], registry);
        if (sub == "search" && argc >= 4) return cmd_module_search(argv[3], registry);
        if (sub == "list") return cmd_module_list(engine_root);
        if (sub == "update") { std::string uid = (argc >= 4 && std::string(argv[3]).rfind("--", 0) != 0) ? argv[3] : ""; return cmd_module_update(uid, engine_root, registry); }
        if (sub == "remove" && argc >= 4) return cmd_module_remove(argv[3], engine_root);
        if (sub == "disable" && argc >= 4) return cmd_module_state(argv[3], engine_root, "disabled");
        if (sub == "enable" && argc >= 4) return cmd_module_state(argv[3], engine_root, "active");
        if (sub == "pin" && argc >= 4) return cmd_module_pin(argv[3], engine_root, true);
        if (sub == "unpin" && argc >= 4) return cmd_module_pin(argv[3], engine_root, false);
        std::cerr << "usage: sdoa module <pack|install|publish|search|list|update|remove|disable|enable|pin|unpin> ...\n"; return 1;
    }
    if (cmd == "dashboard" && argc >= 3) {
        std::string engine_root = opt(argc, argv, "--engine", ".");
        std::string registry = opt(argc, argv, "--registry", default_registry());
        std::string traces_dir = opt(argc, argv, "--traces", "");
        return cmd_dashboard(argv[2], engine_root, registry, traces_dir);
    }
    if (cmd == "docs" && argc >= 3) return cmd_docs(argv[2], opt(argc, argv, "--modules", "modules"));
    if (cmd == "manifest")
        return cmd_manifest(modules, !flag(argc, argv, "--no-stdlib"));
    if (cmd == "codegen" && argc >= 4)
        return cmd_codegen(argv[2], argv[3], modules);
    if (cmd == "run" && argc >= 3) {
        return cmd_run(
            argv[2],
            opt(argc, argv, "--input", ""),
            opt(argc, argv, "--modules", "modules"),
            opt(argc, argv, "--pipeline", ""),
            !flag(argc, argv, "--no-stdlib"),
            flag(argc, argv, "--strict"),
            flag(argc, argv, "--trace"),
            flag(argc, argv, "--inline")
        );
    }
    if (cmd == "help" || cmd == "--help" || cmd == "-h") return usage();
    std::cerr << "unknown command. Run `sdoa help`.\n";
    return 1;
}
