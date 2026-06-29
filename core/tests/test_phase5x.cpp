// ============================================================================
// SDOA Phase 5.x tests: flag-based scheduling (5.1), strict deterministic
// mode (5.2, fail at graph build), and trace metadata enrichment (5.3).
// ============================================================================
#include "runtime/engine.hpp"
#include <cassert>
#include <iostream>
#include <atomic>
#include <thread>
#include <chrono>

using namespace sdoa;
using nlohmann::json;

#define CHECK(c) do{ if(!(c)){ std::cerr<<"FAIL: "#c" @line "<<__LINE__<<"\n"; std::exit(1);} }while(0)

static std::string io_model() {
    json m = {{"domains", json::array({
        {{"id","D"},{"modules", json::array({
            {{"id","IO"},{"capabilities", json::array({{{"name","write"}},{{"name","rng"}},{{"name","pure"}}})},
             {"dependencies",json::array()},{"invariants",json::array()}}
        })}}
    })}};
    return m.dump();
}

static int run_overlap(uint32_t threads, uint32_t flags) {
    Engine e(EngineConfig{.thread_count = threads});
    e.load_model_from_json(io_model());
    std::atomic<int> inflight{0}, maxseen{0};
    auto track = [&](const json&) -> json {
        int c = inflight.fetch_add(1) + 1;
        int prev = maxseen.load();
        while (c > prev && !maxseen.compare_exchange_weak(prev, c)) {}
        std::this_thread::sleep_for(std::chrono::milliseconds(8));
        inflight.fetch_sub(1);
        return json{{"result","ok"}};
    };
    const char* cap = (flags & CAP_SIDE_EFFECTING) ? "write" : "pure";
    e.register_capability("IO", cap, track, CapabilityMeta{flags, "test", "foreign"});
    json steps = json::array();
    for (int i = 0; i < 6; ++i)
        steps.push_back({{"id","S"+std::to_string(i)},{"module_id","IO"},{"capability",cap},{"input",json::object()}});
    e.load_pipelines_from_json(json{{"pipelines",json::array({ {{"id","P"},{"steps",steps},{"edges",json::array()}} })}}.dump());
    auto r = e.run_pipeline("P", json::object());
    CHECK(r->success);
    return maxseen.load();
}

static void test_flag_based_scheduling() {
    int se = run_overlap(4, CAP_SIDE_EFFECTING);
    CHECK(se == 1);                       // side-effecting never overlap
    int pure = run_overlap(4, CAP_PURE);
    CHECK(pure >= 2);                     // pure capabilities run in parallel
    std::cout << "[PASS] flag-based scheduling (side-effecting max overlap=" << se
              << ", pure max overlap=" << pure << ")\n";
}

static void gate_engine(bool inline_exec) {
    EngineConfig cfg{}; cfg.thread_count = 2; cfg.inline_execution = inline_exec;
    Engine e(cfg);
    e.load_model_from_json(io_model());
    e.register_capability("IO", "rng", [](const json&){ return json{{"result", 42}}; },
                          CapabilityMeta{CAP_NONDETERMINISTIC, "test", "foreign"});
    auto step = json::array({{{"id","S"},{"module_id","IO"},{"capability","rng"},{"input",json::object()}}});
    auto run_with = [&](const char* id, json extra) {
        json p = {{"id", id}, {"steps", step}, {"edges", json::array()}};
        for (auto& [k,v] : extra.items()) p[k] = v;
        e.load_pipelines_from_json(json{{"pipelines", json::array({p})}}.dump());
        return e.run_pipeline(id, json::object());
    };
    // default (no flags) -> rejected (default-deny)
    { auto r = run_with("PD", json::object()); CHECK(!r->success);
      CHECK(r->error.find("nondeterministic") != std::string::npos);
      CHECK(r->error.find("NONDETERMINISM_NOT_ALLOWED") != std::string::npos); }
    // strict -> rejected even with allow_nondeterminism
    { auto r = run_with("PS", json{{"strict",true},{"allow_nondeterminism",true}}); CHECK(!r->success); }
    // allow_nondeterminism (not strict) -> permitted
    { auto r = run_with("PA", json{{"allow_nondeterminism",true}}); CHECK(r->success);
      CHECK(r->outputs["S"]["result"] == 42); }
}

static void test_determinism_gate() {
    gate_engine(false);  // threaded
    gate_engine(true);   // inline
    // set_capability_flags propagates the gate (e.g. module-derived nondeterminism).
    EngineConfig cfg{}; cfg.thread_count = 1;
    Engine e(cfg);
    e.load_model_from_json(io_model());
    e.register_capability("IO", "write", [](const json&){ return json{{"result","ok"}}; });  // default pure
    e.set_capability_flags("IO", "write", CAP_NETWORK);  // now network -> gated
    e.load_pipelines_from_json(R"({"pipelines":[{"id":"P","steps":[{"id":"S","module_id":"IO","capability":"write","input":{}}],"edges":[]}]})");
    { auto r = e.run_pipeline("P", json::object()); CHECK(!r->success); }  // network gated by default
    e.load_pipelines_from_json(R"({"pipelines":[{"id":"Pok","allow_nondeterminism":true,"steps":[{"id":"S","module_id":"IO","capability":"write","input":{}}],"edges":[]}]})");
    { auto r = e.run_pipeline("Pok", json::object()); CHECK(r->success); }
    std::cout << "[PASS] determinism gate (default-deny, strict, allow_nondeterminism, set_capability_flags) threaded+inline\n";
}

static void test_trace_enrichment(bool inline_exec) {
    EngineConfig cfg{}; cfg.thread_count = 1; cfg.inline_execution = inline_exec;
    Engine e(cfg);
    e.load_model_from_json(io_model());
    e.register_capability("IO", "write", [](const json&){ return json{{"result","ok"}}; },
                          CapabilityMeta{CAP_SIDE_EFFECTING, "test", "foreign"});
    e.load_pipelines_from_json(json{{"pipelines",json::array({
        {{"id","P"},{"steps",json::array({{{"id","S"},{"module_id","IO"},{"capability","write"},{"input",json::object()}}})},{"edges",json::array()}}
    })}}.dump());
    auto r = e.run_pipeline("P", json::object());
    CHECK(r->success);
    bool checked_start = false, pipeline_has_no_cap = true;
    for (const auto& ev : r->trace) {
        const std::string type = ev["event_type"];
        if (ev["step_id"] == "") {
            if (ev.contains("capability")) pipeline_has_no_cap = false; // pipeline events must NOT be enriched
        } else if (type == "STEP_START") {
            CHECK(ev.contains("capability"));
            const auto& c = ev["capability"];
            CHECK(c["module"] == "IO");
            CHECK(c["capability"] == "write");
            CHECK(c["origin"] == "foreign");
            CHECK(c["language"] == "test");
            CHECK(c["flags"]["side_effecting"] == true);
            CHECK(c["flags"]["pure"] == false);
            checked_start = true;
        }
    }
    CHECK(checked_start);
    CHECK(pipeline_has_no_cap);
}

static void test_trace_metadata() {
    test_trace_enrichment(false);
    test_trace_enrichment(true);
    std::cout << "[PASS] trace metadata enrichment present on step events (threaded + inline)\n";
}

int main() {
    std::cout << "=== SDOA Phase 5.x Tests (flags / strict / trace) ===\n";
    test_flag_based_scheduling();
    test_determinism_gate();
    test_trace_metadata();
    std::cout << "\nAll Phase 5.x tests passed.\n";
    return 0;
}
