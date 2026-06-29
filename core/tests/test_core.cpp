// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "test_model.cpp"
// type:            "module"
// layer:           5
// runtime:         "C++20"
// version:         "1.0.0"
// operationalRole: "testing"
// optimization:    { priority: "correctness" }
// capabilities:    ["test_model_contract"]
// dependencies:    ["engine.hpp"]
// docs:            "First end-to-end test. Proves the entire Model Contract
//                   path: JSON parse -> struct build -> validation -> storage.
//                   Also tests rejection of malformed, empty, and invalid
//                   models to verify error reporting across the boundary."
// ============================================================================

#include "runtime/engine.hpp"
#include "runtime/resolve.hpp"
#include "runtime/merge.hpp"
#include <cassert>
#include <iostream>

using sdoa::Engine;
using sdoa::EngineConfig;
using sdoa::Result;

static void test_valid_model() {
    EngineConfig cfg{};
    Engine engine(cfg);

    const char* json = R"({
        "domains": [
            {
                "id": "Security",
                "modules": [
                    {
                        "id": "SecretScanner",
                        "capabilities": [
                            {
                                "name": "scan",
                                "inputs": ["string"],
                                "outputs": ["json"]
                            }
                        ],
                        "dependencies": [],
                        "invariants": []
                    }
                ]
            }
        ]
    })";

    auto result = engine.load_model_from_json(json);
    assert(result == Result::Ok);

    const auto& model = engine.get_model();
    assert(model.domains.size() == 1);
    assert(model.findModule("SecretScanner") != nullptr);
    assert(model.findCapability("SecretScanner", "scan") != nullptr);
    assert(model.findModule("NonExistent") == nullptr);

    std::cout << "[PASS] test_valid_model\n";
}

static void test_empty_json() {
    Engine engine(EngineConfig{});
    auto result = engine.load_model_from_json("");
    assert(result == Result::InvalidArgument);
    assert(!engine.get_last_error().empty());
    std::cout << "[PASS] test_empty_json\n";
}

static void test_malformed_json() {
    Engine engine(EngineConfig{});
    auto result = engine.load_model_from_json("{not valid}");
    assert(result == Result::ParseFailed);
    assert(!engine.get_last_error().empty());
    std::cout << "[PASS] test_malformed_json\n";
}

static void test_missing_domains() {
    Engine engine(EngineConfig{});
    auto result = engine.load_model_from_json(R"({"something": 42})");
    assert(result == Result::ParseFailed);
    std::cout << "[PASS] test_missing_domains\n";
}

static void test_broken_dependency() {
    Engine engine(EngineConfig{});
    const char* json = R"({
        "domains": [{"id": "d", "modules": [{
            "id": "mod_a",
            "capabilities": [{"name": "x", "inputs": [], "outputs": []}],
            "dependencies": ["mod_nonexistent"],
            "invariants": []
        }]}]
    })";
    // validator catches broken deps, returning ModelInvalid
    auto result = engine.load_model_from_json(json);
    assert(result == Result::ModelInvalid);
    std::cout << "[PASS] test_broken_dependency\n";
}

static void test_self_dependency() {
    Engine engine(EngineConfig{});
    const char* json = R"({
        "domains": [{"id": "d", "modules": [{
            "id": "mod_a",
            "capabilities": [{"name": "x", "inputs": [], "outputs": []}],
            "dependencies": ["mod_a"],
            "invariants": []
        }]}]
    })";
    auto result = engine.load_model_from_json(json);
    assert(result == Result::ModelInvalid);
    assert(engine.get_last_error().find("depends on itself") != std::string::npos);
    std::cout << "[PASS] test_self_dependency\n";
}

static void test_zero_capabilities() {
    Engine engine(EngineConfig{});
    const char* json = R"({
        "domains": [{"id": "d", "modules": [{
            "id": "mod_a",
            "capabilities": [],
            "dependencies": [],
            "invariants": []
        }]}]
    })";
    auto result = engine.load_model_from_json(json);
    assert(result == Result::ModelInvalid);
    assert(engine.get_last_error().find("zero capabilities") != std::string::npos);
    std::cout << "[PASS] test_zero_capabilities\n";
}

static void test_multi_domain_model() {
    Engine engine(EngineConfig{});
    const char* json = R"({
        "domains": [
            {
                "id": "Security",
                "modules": [
                    {
                        "id": "SecretScanner",
                        "capabilities": [{"name": "scan", "inputs": ["string"], "outputs": ["json"]}],
                        "dependencies": [],
                        "invariants": []
                    }
                ]
            },
            {
                "id": "IO",
                "modules": [
                    {
                        "id": "FileReader",
                        "capabilities": [{"name": "read", "inputs": ["string"], "outputs": ["bytes"]}],
                        "dependencies": [],
                        "invariants": [
                            {"kind": "forbidden_edge", "subject": "FileReader", "target": "SecretScanner", "message": "no direct IO->Security"}
                        ]
                    }
                ]
            }
        ]
    })";

    auto result = engine.load_model_from_json(json);
    assert(result == Result::Ok);

    const auto& model = engine.get_model();
    assert(model.domains.size() == 2);
    assert(model.findModule("SecretScanner") != nullptr);
    assert(model.findModule("FileReader") != nullptr);

    // Verify invariant was parsed
    const auto* fr = model.findModule("FileReader");
    assert(fr->invariants.size() == 1);
    assert(fr->invariants[0].kind == "forbidden_edge");

    std::cout << "[PASS] test_multi_domain_model\n";
}

static void test_valid_pipeline() {
    Engine engine(EngineConfig{});
    // Minimal valid model
    engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
        {"id": "M1", "capabilities": [{"name": "cap1"}], "dependencies": [], "invariants": []},
        {"id": "M2", "capabilities": [{"name": "cap2"}], "dependencies": [], "invariants": []}
    ]}]})");

    const char* pipeline_json = R"({
        "pipelines": [
            {
                "id": "TestPipe",
                "steps": [
                    {"id": "S1", "module_id": "M1", "capability": "cap1"},
                    {"id": "S2", "module_id": "M2", "capability": "cap2"}
                ],
                "edges": [
                    {"source_step": "S1", "target_step": "S2"}
                ]
            }
        ]
    })";

    auto result = engine.load_pipelines_from_json(pipeline_json);
    if (result != Result::Ok) {
        std::cerr << "Fail: " << engine.get_last_error() << "\n";
    }
    assert(result == Result::Ok);

    const auto* p = engine.find_pipeline("TestPipe");
    assert(p != nullptr);
    assert(p->steps.size() == 2);
    assert(p->edges.size() == 1);
    
    auto roots = p->get_root_steps();
    assert(roots.size() == 1);
    assert(roots[0] == "S1");

    std::cout << "[PASS] test_valid_pipeline\n";
}

static void test_pipeline_cycle() {
    Engine engine(EngineConfig{});
    engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
        {"id": "M1", "capabilities": [{"name": "cap1"}], "dependencies": [], "invariants": []}
    ]}]})");

    const char* pipeline_json = R"({
        "pipelines": [
            {
                "id": "CyclePipe",
                "steps": [
                    {"id": "S1", "module_id": "M1", "capability": "cap1"},
                    {"id": "S2", "module_id": "M1", "capability": "cap1"}
                ],
                "edges": [
                    {"source_step": "S1", "target_step": "S2"},
                    {"source_step": "S2", "target_step": "S1"}
                ]
            }
        ]
    })";

    auto result = engine.load_pipelines_from_json(pipeline_json);
    assert(result == Result::ModelInvalid);
    assert(engine.get_last_error().find("contains a cycle") != std::string::npos);
    std::cout << "[PASS] test_pipeline_cycle\n";
}

static void test_pipeline_unknown_capability() {
    Engine engine(EngineConfig{});
    engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
        {"id": "M1", "capabilities": [{"name": "cap1"}], "dependencies": [], "invariants": []}
    ]}]})");

    const char* pipeline_json = R"({
        "pipelines": [
            {
                "id": "BadPipe",
                "steps": [
                    {"id": "S1", "module_id": "M1", "capability": "missing_cap"}
                ]
            }
        ]
    })";

    auto result = engine.load_pipelines_from_json(pipeline_json);
    assert(result == Result::ModelInvalid);
    assert(engine.get_last_error().find("unknown capability") != std::string::npos);
    std::cout << "[PASS] test_pipeline_unknown_capability\n";
}

static void test_single_step_pipeline() {
    Engine engine(EngineConfig{});
    engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
        {"id": "Math", "capabilities": [{"name": "double"}], "dependencies": [], "invariants": []}
    ]}]})");

    engine.load_pipelines_from_json(R"({"pipelines": [{
        "id": "DoublePipe",
        "steps": [{"id": "S1", "module_id": "Math", "capability": "double"}],
        "edges": []
    }]})");

    engine.register_capability("Math", "double", [](const nlohmann::json& in) {
        int val = in.value("val", 0);
        return nlohmann::json{{"val", val * 2}};
    });

    auto res = engine.run_pipeline("DoublePipe", R"({"val": 21})"_json);
    if (!res->success) std::cout << "ERR: " << res->error << "\n";
    assert(res->success);
    assert(res->outputs["S1"]["val"] == 42);
    std::cout << "[PASS] test_single_step_pipeline\n" << std::flush;
}

static void test_linear_pipeline() {
    Engine engine(EngineConfig{});
    engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
        {"id": "Math", "capabilities": [{"name": "add1"}, {"name": "mul2"}], "dependencies": [], "invariants": []}
    ]}]})");

    engine.load_pipelines_from_json(R"({"pipelines": [{
        "id": "MathPipe",
        "steps": [
            {"id": "A", "module_id": "Math", "capability": "add1"},
            {"id": "B", "module_id": "Math", "capability": "mul2"}
        ],
        "edges": [{"source_step": "A", "target_step": "B"}]
    }]})");

    engine.register_capability("Math", "add1", [](const nlohmann::json& in) {
        return nlohmann::json{{"val", in.value("val", 0) + 1}};
    });
    engine.register_capability("Math", "mul2", [](const nlohmann::json& in) {
        return nlohmann::json{{"val", in.value("val", 0) * 2}};
    });

    auto res = engine.run_pipeline("MathPipe", R"({"val": 5})"_json); // (5+1)*2 = 12
    if (!res->success) std::cout << "ERR: " << res->error << "\n";
    assert(res->success);
    assert(res->outputs["B"]["val"] == 12);
    std::cout << "[PASS] test_linear_pipeline\n" << std::flush;
}

static void test_parallel_pipeline() {
    Engine engine(EngineConfig{});
    engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
        {"id": "IO", "capabilities": [{"name": "fetch"}, {"name": "parse"}], "dependencies": [], "invariants": []}
    ]}]})");

    engine.load_pipelines_from_json(R"({"pipelines": [{
        "id": "ParallelPipe",
        "steps": [
            {"id": "FetchA", "module_id": "IO", "capability": "fetch"},
            {"id": "FetchB", "module_id": "IO", "capability": "fetch"},
            {"id": "ParseBoth", "module_id": "IO", "capability": "parse"}
        ],
        "edges": [
            {"source_step": "FetchA", "target_step": "ParseBoth"},
            {"source_step": "FetchB", "target_step": "ParseBoth"}
        ]
    }]})");

    engine.register_capability("IO", "fetch", [](const nlohmann::json& in) {
        int v = in.value("start", 0);
        return nlohmann::json{{std::to_string(v), v * 10}};
    });
    engine.register_capability("IO", "parse", [](const nlohmann::json& in) {
        int sum = 0;
        for (auto& el : in.items()) {
            if (el.key() != "start") {
                sum += el.value().get<int>();
            }
        }
        return nlohmann::json{{"sum", sum}};
    });

    auto res = engine.run_pipeline("ParallelPipe", R"({"start": 5})"_json);
    if (!res->success) std::cout << "ERR: " << res->error << "\n";
    assert(res->success);
    // FetchA and FetchB both output {"5": 50}. Merged it's {"5": 50}. 
    // Wait, the input is identical to both roots, so they do the same work. Let's just assert success.
    assert(res->outputs["ParseBoth"]["sum"] == 50); // It merges into one key "5"
    std::cout << "[PASS] test_parallel_pipeline\n" << std::flush;
}

static void test_missing_capability_impl() {
    Engine engine(EngineConfig{});
    engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
        {"id": "M1", "capabilities": [{"name": "cap"}], "dependencies": [], "invariants": []}
    ]}]})");
    engine.load_pipelines_from_json(R"({"pipelines": [{
        "id": "Pipe",
        "steps": [{"id": "S1", "module_id": "M1", "capability": "cap"}],
        "edges": []
    }]})");

    // We do NOT register M1::cap
    auto res = engine.run_pipeline("Pipe", "{}"_json);
    assert(!res->success);
    assert(res->error.find("Missing capability implementation") != std::string::npos);
    std::cout << "[PASS] test_missing_capability_impl\n" << std::flush;
}

static void test_capability_exception() {
    Engine engine(EngineConfig{});
    engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
        {"id": "M1", "capabilities": [{"name": "crash"}], "dependencies": [], "invariants": []}
    ]}]})");
    engine.load_pipelines_from_json(R"({"pipelines": [{
        "id": "Pipe",
        "steps": [{"id": "S1", "module_id": "M1", "capability": "crash"}],
        "edges": []
    }]})");

    engine.register_capability("M1", "crash", [](const nlohmann::json&) {
        throw std::runtime_error("Simulated crash");
        return nlohmann::json{};
    });

    auto res = engine.run_pipeline("Pipe", "{}"_json);
    assert(!res->success);
    assert(res->error.find("Capability exception in step 'S1': Simulated crash") != std::string::npos);
    std::cout << "[PASS] test_capability_exception\n" << std::flush;
}

static void test_deterministic_output() {
    Engine engine(EngineConfig{});
    engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
        {"id": "Math", "capabilities": [{"name": "add1"}], "dependencies": [], "invariants": []}
    ]}]})");
    engine.load_pipelines_from_json(R"({"pipelines": [{
        "id": "Pipe",
        "steps": [
            {"id": "A", "module_id": "Math", "capability": "add1"},
            {"id": "B", "module_id": "Math", "capability": "add1"},
            {"id": "C", "module_id": "Math", "capability": "add1"}
        ],
        "edges": [{"source_step": "A", "target_step": "C"}, {"source_step": "B", "target_step": "C"}]
    }]})");

    std::atomic<int> exec_count{0};
    engine.register_capability("Math", "add1", [&](const nlohmann::json& in) {
        exec_count++;
        return nlohmann::json{{"val", in.value("val", 0) + 1}};
    });

    for (int i=0; i<10; ++i) {
        auto res = engine.run_pipeline("Pipe", R"({"val": 0})"_json);
        if (!res->success) std::cout << "ERR: " << res->error << "\n";
        assert(res->success);
        assert(res->outputs["C"]["val"] == 2); // A outputs 1, B outputs 1, C gets {"val":1} and outputs 2.
    }
    assert(exec_count == 30);
    std::cout << "[PASS] test_deterministic_output\n" << std::flush;
}

static void test_scheduler_reuse() {
    Engine engine(EngineConfig{});
    engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
        {"id": "Math", "capabilities": [{"name": "add1"}], "dependencies": [], "invariants": []}
    ]}]})");

    engine.load_pipelines_from_json(R"({"pipelines": [
        {"id": "PipeA", "steps": [{"id": "S1", "module_id": "Math", "capability": "add1"}]},
        {"id": "PipeB", "steps": [{"id": "S1", "module_id": "Math", "capability": "add1"}]}
    ]})");

    engine.register_capability("Math", "add1", [](const nlohmann::json& in) {
        return nlohmann::json{{"val", in.value("val", 0) + 1}};
    });

    auto resA = engine.run_pipeline("PipeA", R"({"val": 0})"_json);
    assert(resA->success && resA->outputs["S1"]["val"] == 1);

    auto resB = engine.run_pipeline("PipeB", R"({"val": 10})"_json);
    assert(resB->success && resB->outputs["S1"]["val"] == 11);

    std::cout << "[PASS] test_scheduler_reuse\n" << std::flush;
}

static void test_sequential_stress() {
    Engine engine(EngineConfig{.thread_count = 1});
    engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
        {"id": "Math", "capabilities": [{"name": "add1"}], "dependencies": [], "invariants": []}
    ]}]})");
    engine.load_pipelines_from_json(R"({"pipelines": [
        {"id": "Pipe", "steps": [{"id": "S1", "module_id": "Math", "capability": "add1"}]}
    ]})");
    engine.register_capability("Math", "add1", [](const nlohmann::json& in) {
        return nlohmann::json{{"val", in.value("val", 0) + 1}};
    });

    for (int i = 0; i < 20; ++i) {
        auto res = engine.run_pipeline("Pipe", R"({"val": 0})"_json);
        assert(res->success && res->outputs["S1"]["val"] == 1);
    }

    std::cout << "[PASS] test_sequential_stress\n" << std::flush;
}

static void test_parallel_stress() {
    Engine engine(EngineConfig{.thread_count = 1});
    engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
        {"id": "Math", "capabilities": [{"name": "add1"}], "dependencies": [], "invariants": []}
    ]}]})");
    engine.load_pipelines_from_json(R"({"pipelines": [
        {"id": "Pipe", "steps": [{"id": "S1", "module_id": "Math", "capability": "add1"}]}
    ]})");
    engine.register_capability("Math", "add1", [](const nlohmann::json& in) {
        return nlohmann::json{{"val", in.value("val", 0) + 1}};
    });

    std::vector<std::thread> threads;
    std::atomic<int> success_count{0};

    for (int i = 0; i < 20; ++i) {
        threads.emplace_back([&engine, &success_count]() {
            auto res = engine.run_pipeline("Pipe", R"({"val": 0})"_json);
            if (res->success && res->outputs["S1"]["val"] == 1) {
                success_count++;
            }
        });
    }

    for (auto& t : threads) {
        t.join();
    }

    assert(success_count == 20);
    std::cout << "[PASS] test_parallel_stress\n" << std::flush;
}

static void test_json_merge_rules() {
    using sdoa::deep_merge;
    
    // Object + Object -> deep merge
    auto obj1 = R"({"a": 1, "b": {"c": 2}})"_json;
    auto obj2 = R"({"b": {"d": 3}, "e": 4})"_json;
    auto merged_obj = deep_merge(obj1, obj2);
    assert(merged_obj["a"] == 1);
    assert(merged_obj["b"]["c"] == 2);
    assert(merged_obj["b"]["d"] == 3);
    assert(merged_obj["e"] == 4);

    // Array + Array -> replace
    auto arr1 = R"({"a": [1, 2]})"_json;
    auto arr2 = R"({"a": [3, 4]})"_json;
    auto merged_arr = deep_merge(arr1, arr2);
    assert(merged_arr["a"] == R"([3, 4])"_json);

    // Primitive -> replace
    auto prim1 = R"({"a": 1})"_json;
    auto prim2 = R"({"a": "hello"})"_json;
    auto merged_prim = deep_merge(prim1, prim2);
    assert(merged_prim["a"] == "hello");

    std::cout << "[PASS] test_json_merge_rules\n";
}

static void test_input_resolution_success() {
    Engine engine(EngineConfig{.thread_count = 1});
    engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
        {"id": "Util", "capabilities": [{"name": "identity"}], "dependencies": [], "invariants": []}
    ]}]})");

    engine.load_pipelines_from_json(R"({"pipelines": [{
        "id": "ResolvePipe",
        "steps": [
            {"id": "StepA", "module_id": "Util", "capability": "identity"},
            {
                "id": "StepB", 
                "module_id": "Util", 
                "capability": "identity",
                "input": {
                    "single_ref": "@StepA.val",
                    "nested_ref": "@StepA.nested.foo",
                    "passthrough_arr": "@StepA.arr"
                }
            }
        ],
        "edges": [
            {"source_step": "StepA", "target_step": "StepB"}
        ]
    }]})");

    engine.register_capability("Util", "identity", [](const nlohmann::json& in) {
        return in;
    });

    auto initial_input = R"({
        "val": 42,
        "nested": {"foo": "bar"},
        "arr": [1, 2]
    })"_json;

    auto res = engine.run_pipeline("ResolvePipe", initial_input);
    if (!res->success) std::cout << "ERR: " << res->error << "\n";
    assert(res->success);
    
    const auto& b_out = res->outputs["StepB"];
    assert(b_out["single_ref"] == 42);
    assert(b_out["nested_ref"] == "bar");
    assert(b_out["passthrough_arr"] == R"([1, 2])"_json);

    std::cout << "[PASS] test_input_resolution_success\n";
}

static void test_input_resolution_errors() {
    // 1. Missing step reference
    {
        Engine engine(EngineConfig{.thread_count = 1});
        engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
            {"id": "Util", "capabilities": [{"name": "identity"}], "dependencies": [], "invariants": []}
        ]}]})");
        engine.load_pipelines_from_json(R"({"pipelines": [{
            "id": "BadPipe1",
            "steps": [
                {"id": "StepA", "module_id": "Util", "capability": "identity", "input": {"val": "@MissingStep.val"}}
            ],
            "edges": []
        }]})");
        engine.register_capability("Util", "identity", [](const nlohmann::json& in) { return in; });
        auto res = engine.run_pipeline("BadPipe1", "{}"_json);
        assert(!res->success);
        assert(res->error.find("Reference to unknown step") != std::string::npos);
    }

    // 2. Missing field reference
    {
        Engine engine(EngineConfig{.thread_count = 1});
        engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
            {"id": "Util", "capabilities": [{"name": "identity"}], "dependencies": [], "invariants": []}
        ]}]})");
        engine.load_pipelines_from_json(R"({"pipelines": [{
            "id": "BadPipe2",
            "steps": [
                {"id": "StepA", "module_id": "Util", "capability": "identity"},
                {"id": "StepB", "module_id": "Util", "capability": "identity", "input": {"val": "@StepA.missing"}}
            ],
            "edges": [{"source_step": "StepA", "target_step": "StepB"}]
        }]})");
        engine.register_capability("Util", "identity", [](const nlohmann::json& in) { return in; });
        auto res = engine.run_pipeline("BadPipe2", R"({"val": 1})"_json);
        assert(!res->success);
        assert(res->error.find("Field 'missing' not found") != std::string::npos);
    }

    // 3. Invalid reference format
    {
        Engine engine(EngineConfig{.thread_count = 1});
        engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
            {"id": "Util", "capabilities": [{"name": "identity"}], "dependencies": [], "invariants": []}
        ]}]})");
        engine.load_pipelines_from_json(R"({"pipelines": [{
            "id": "BadPipe3",
            "steps": [
                {"id": "StepA", "module_id": "Util", "capability": "identity", "input": {"val": "@StepA"}}
            ],
            "edges": []
        }]})");
        engine.register_capability("Util", "identity", [](const nlohmann::json& in) { return in; });
        auto res = engine.run_pipeline("BadPipe3", "{}"_json);
        assert(!res->success);
        assert(res->error.find("Invalid input reference format") != std::string::npos);
    }

    std::cout << "[PASS] test_input_resolution_errors\n";
}

static void test_trace_hook_sequence() {
    Engine engine(EngineConfig{.thread_count = 1});
    engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
        {"id": "Math", "capabilities": [{"name": "add1"}], "dependencies": [], "invariants": []}
    ]}]})");
    engine.load_pipelines_from_json(R"({"pipelines": [{
        "id": "TracePipe",
        "steps": [
            {"id": "A", "module_id": "Math", "capability": "add1"}
        ],
        "edges": []
    }]})");

    engine.register_capability("Math", "add1", [](const nlohmann::json& in) {
        return nlohmann::json{{"val", in.value("val", 0) + 1}};
    });

    struct TraceEvent {
        std::string step_id;
        std::string event_type;
        nlohmann::json context;
    };
    std::vector<TraceEvent> events;
    std::mutex event_mutex;

    engine.set_trace_hook([&](const std::string& pipeline_id, const std::string& step_id, const std::string& event_type, const nlohmann::json& context) {
        std::lock_guard<std::mutex> lock(event_mutex);
        assert(pipeline_id == "TracePipe");
        events.push_back({step_id, event_type, context});
    });

    auto res = engine.run_pipeline("TracePipe", R"({"val": 5})"_json);
    assert(res->success);

    // Validate event count & ordering
    assert(events.size() == 4);
    
    assert(events[0].event_type == "PIPELINE_START");
    assert(events[0].step_id == "");

    assert(events[1].event_type == "STEP_START");
    assert(events[1].step_id == "A");
    assert(events[1].context["val"] == 5);

    assert(events[2].event_type == "STEP_SUCCESS");
    assert(events[2].step_id == "A");
    assert(events[2].context["val"] == 6);

    assert(events[3].event_type == "PIPELINE_COMPLETE");
    assert(events[3].step_id == "");
    assert(events[3].context["success"] == true);
    assert(events[3].context["outputs"]["A"]["val"] == 6);

    // Validate result trace list
    assert(res->trace.is_array());
    assert(res->trace.size() == 4);
    assert(res->trace[0]["event_type"] == "PIPELINE_START");
    assert(res->trace[1]["event_type"] == "STEP_START");
    assert(res->trace[2]["event_type"] == "STEP_SUCCESS");
    assert(res->trace[3]["event_type"] == "PIPELINE_COMPLETE");

    std::cout << "[PASS] test_trace_hook_sequence\n";
}

static void test_phase4_determinism() {
    Engine engine(EngineConfig{.thread_count = 2});
    engine.load_model_from_json(R"({"domains": [{"id": "D1", "modules": [
        {"id": "Math", "capabilities": [{"name": "add1"}], "dependencies": [], "invariants": []}
    ]}]})");
    engine.load_pipelines_from_json(R"({"pipelines": [{
        "id": "Pipe",
        "steps": [
            {"id": "A", "module_id": "Math", "capability": "add1"},
            {"id": "B", "module_id": "Math", "capability": "add1", "input": {"val": "@A.val"}},
            {"id": "C", "module_id": "Math", "capability": "add1", "input": {"val": "@B.val"}}
        ],
        "edges": [
            {"source_step": "A", "target_step": "B"},
            {"source_step": "B", "target_step": "C"}
        ]
    }]})");

    engine.register_capability("Math", "add1", [](const nlohmann::json& in) {
        return nlohmann::json{{"val", in.value("val", 0) + 1}};
    });

    nlohmann::json expected_outputs;
    {
        auto res = engine.run_pipeline("Pipe", R"({"val": 0})"_json);
        assert(res->success);
        expected_outputs = res->outputs;
        assert(res->outputs["C"]["val"] == 3);
    }

    for (int i = 0; i < 50; ++i) {
        auto res = engine.run_pipeline("Pipe", R"({"val": 0})"_json);
        assert(res->success);
        assert(res->outputs == expected_outputs);
    }

    std::cout << "[PASS] test_phase4_determinism\n";
}

int main() {
    std::cout << "=== SDOA Model Contract Tests ===\n";

    test_valid_model();
    test_empty_json();
    test_malformed_json();
    test_missing_domains();
    test_broken_dependency();
    test_self_dependency();
    test_zero_capabilities();
    test_multi_domain_model();

    std::cout << "\n=== SDOA Pipeline Contract Tests ===\n";
    test_valid_pipeline();
    test_pipeline_cycle();
    test_pipeline_unknown_capability();

    std::cout << "\n=== SDOA Execution Tests ===\n";
    test_single_step_pipeline();
    test_linear_pipeline();
    test_parallel_pipeline();
    test_missing_capability_impl();
    test_capability_exception();
    test_deterministic_output();
    test_scheduler_reuse();
    test_sequential_stress();
    test_parallel_stress();

    std::cout << "\n=== SDOA Phase 4 Tests ===\n";
    test_json_merge_rules();
    test_input_resolution_success();
    test_input_resolution_errors();
    test_trace_hook_sequence();
    test_phase4_determinism();

    std::cout << "\nAll tests passed.\n";
    return 0;
}
