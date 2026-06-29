// ============================================================================
// SDOA MANIFEST
// ============================================================================
// id:              "test_stdlib.cpp"
// type:            "module"
// layer:           5
// runtime:         "C++20"
// version:         "1.0.0"
// timestamp:       "2026-06-24T07:10:00Z"
// operationalRole: "testing"
// optimization:    { priority: "correctness" }
// capabilities:    ["test_stdlib_capabilities"]
// dependencies:    ["engine.hpp", "capabilities.hpp"]
// docs:            "Phase 4.1 capability standard-library tests. Exercises every
//                   built-in capability, multi-step @step.result input/output
//                   resolution chains, FileSystem sandbox confinement, and
//                   determinism under repeated multithreaded execution."
// ============================================================================

#include "runtime/engine.hpp"
#include "capabilities/capabilities.hpp"
#include <cassert>
#include <iostream>
#include <fstream>
#include <filesystem>

using namespace sdoa;
namespace fs = std::filesystem;
using nlohmann::json;

static std::string g_fs_root;

// Build a model declaring every stdlib module/capability so pipelines validate.
static std::string stdlib_model() {
    json m;
    m["domains"] = json::array();
    auto add = [&](const std::string& dom, const std::string& mod, std::vector<std::string> caps) {
        json caparr = json::array();
        for (auto& c : caps) caparr.push_back(json{{"name", c}});
        json module = {{"id", mod}, {"capabilities", caparr}, {"dependencies", json::array()}, {"invariants", json::array()}};
        m["domains"].push_back(json{{"id", dom}, {"modules", json::array({module})}});
    };
    add("Str", "String", {"concat","split","replace","trim","to_upper","to_lower","format"});
    add("Num", "Math", {"add","subtract","multiply","divide","round","clamp","sum","avg"});
    add("Js", "Json", {"get","set","remove","merge","flatten","unflatten","filter","map"});
    add("Fs", "FileSystem", {"read_text","read_json","list_dir","stat"});
    add("Sys", "System", {"echo","version","capabilities"});
    return m.dump();
}

static Engine make_engine(uint32_t threads = 2) {
    Engine e(EngineConfig{.thread_count = threads});
    auto r = e.load_model_from_json(stdlib_model());
    if (r != Result::Ok) { std::cerr << "model load failed: " << e.get_last_error() << "\n"; std::exit(1); }
    caps::register_capabilities(e, caps::CapabilitiesConfig{.fs_root = g_fs_root});
    return e;
}

// Run a single capability: params are embedded as the step's input template.
static json run1(Engine& e, const std::string& mod, const std::string& cap, const json& params) {
    json step = {{"id","S"},{"module_id",mod},{"capability",cap},{"input",params}};
    json pj = {{"pipelines", json::array({ json{{"id","P"},{"steps", json::array({step})},{"edges", json::array()}} }) }};
    auto lr = e.load_pipelines_from_json(pj.dump());
    if (lr != Result::Ok) { std::cerr << "pipeline load failed: " << e.get_last_error() << "\n"; std::exit(1); }
    auto res = e.run_pipeline("P", json::object());
    if (!res->success) throw std::runtime_error(res->error);
    return res->outputs["S"];
}

#define CHECK(cond) do { if(!(cond)){ std::cerr << "FAIL: " #cond " @line " << __LINE__ << "\n"; std::exit(1);} } while(0)

static void test_string() {
    Engine e = make_engine();
    CHECK(run1(e,"String","concat",{{"parts",{"a","b","c"}}})["result"] == "abc");
    CHECK(run1(e,"String","concat",{{"parts",{"a","b"}},{"sep","-"}})["result"] == "a-b");
    CHECK(run1(e,"String","concat",{{"parts",{"x",1,true}}})["result"] == "x1true");
    CHECK(run1(e,"String","split",{{"text","a,b,c"},{"sep",","}})["result"] == json::array({"a","b","c"}));
    CHECK(run1(e,"String","replace",{{"text","aXaXa"},{"find","X"},{"replace","-"}})["result"] == "a-a-a");
    CHECK(run1(e,"String","trim",{{"text","  hi  "}})["result"] == "hi");
    CHECK(run1(e,"String","to_upper",{{"text","aBc"}})["result"] == "ABC");
    CHECK(run1(e,"String","to_lower",{{"text","aBc"}})["result"] == "abc");
    CHECK(run1(e,"String","format",{{"template","Hi {name}, {n} msgs"},{"args",{{"name","Tre"},{"n",3}}}})["result"] == "Hi Tre, 3 msgs");
    std::cout << "[PASS] test_string\n";
}

static void test_math() {
    Engine e = make_engine();
    CHECK(run1(e,"Math","add",{{"a",2},{"b",3}})["result"] == 5);
    CHECK(run1(e,"Math","subtract",{{"a",10},{"b",4}})["result"] == 6);
    CHECK(run1(e,"Math","multiply",{{"a",6},{"b",7}})["result"] == 42);
    CHECK(run1(e,"Math","divide",{{"a",9},{"b",2}})["result"] == 4.5);
    CHECK(run1(e,"Math","round",{{"value",3.14159},{"places",2}})["result"] == 3.14);
    CHECK(run1(e,"Math","clamp",{{"value",15},{"min",0},{"max",10}})["result"] == 10);
    CHECK(run1(e,"Math","clamp",{{"value",-3},{"min",0},{"max",10}})["result"] == 0);
    CHECK(run1(e,"Math","sum",{{"values",{1,2,3,4}}})["result"] == 10);
    CHECK(run1(e,"Math","avg",{{"values",{2,4,6}}})["result"] == 4);
    // error: divide by zero
    bool threw=false; try { run1(e,"Math","divide",{{"a",1},{"b",0}}); } catch(...){ threw=true; }
    CHECK(threw);
    std::cout << "[PASS] test_math\n";
}

static void test_json() {
    Engine e = make_engine();
    json data = {{"a",{{"b",{{"c",42}}}}},{"x",1}};
    CHECK(run1(e,"Json","get",{{"data",data},{"path","a.b.c"}})["result"] == 42);
    CHECK(run1(e,"Json","set",{{"data",data},{"path","a.b.d"},{"value",99}})["result"]["a"]["b"]["d"] == 99);
    CHECK(run1(e,"Json","remove",{{"data",data},{"path","x"}})["result"].contains("x") == false);
    CHECK(run1(e,"Json","merge",{{"base",{{"a",1}}},{"override",{{"b",2}}}})["result"] == json({{"a",1},{"b",2}}));
    auto flat = run1(e,"Json","flatten",{{"data",data}})["result"];
    CHECK(flat["a.b.c"] == 42 && flat["x"] == 1);
    auto un = run1(e,"Json","unflatten",{{"data",{{"a.b.c",42},{"x",1}}}})["result"];
    CHECK(un["a"]["b"]["c"] == 42 && un["x"] == 1);
    json items = json::array({ {{"k","keep"},{"v",1}}, {{"k","drop"},{"v",2}}, {{"k","keep"},{"v",3}} });
    auto filt = run1(e,"Json","filter",{{"items",items},{"key","k"},{"equals","keep"}})["result"];
    CHECK(filt.size()==2 && filt[0]["v"]==1 && filt[1]["v"]==3);
    auto mapped = run1(e,"Json","map",{{"items",items},{"path","v"}})["result"];
    CHECK(mapped == json::array({1,2,3}));
    // array indexing in get
    CHECK(run1(e,"Json","get",{{"data",{{"arr",{10,20,30}}}},{"path","arr.1"}})["result"] == 20);
    std::cout << "[PASS] test_json\n";
}

static void test_system() {
    Engine e = make_engine();
    CHECK(run1(e,"System","echo",{{"hello","world"}})["hello"] == "world");
    CHECK(run1(e,"System","version",json::object())["result"] == "4.1.0");
    auto caps = run1(e,"System","capabilities",json::object())["result"];
    CHECK(caps.is_array());
    bool found=false; for (auto& c : caps) if (c=="Math::add") found=true;
    CHECK(found);
    std::cout << "[PASS] test_system (" << caps.size() << " capabilities registered)\n";
}

static void test_stdlib_schemas() {
    Engine e = make_engine();
    auto man = e.capabilities_manifest();
    int n = 0;
    for (const auto& c : man) {
        if (c["origin"] == "builtin") {
            CHECK(c.contains("input_schema"));
            CHECK(c.contains("output_schema"));
            n++;
        }
    }
    CHECK(n == 30);
    std::cout << "[PASS] all " << n << " stdlib capabilities have schemas\n";
}

static void test_filesystem() {
    Engine e = make_engine();
    CHECK(run1(e,"FileSystem","read_text",{{"path","hello.txt"}})["result"] == "hello sdoa");
    CHECK(run1(e,"FileSystem","read_json",{{"path","data.json"}})["result"]["k"] == "v");
    auto names = run1(e,"FileSystem","list_dir",{{"path","."}})["result"];
    CHECK(names.is_array() && names.size() >= 3); // hello.txt, data.json, sub
    auto st = run1(e,"FileSystem","stat",{{"path","hello.txt"}})["result"];
    CHECK(st["exists"]==true && st["is_file"]==true && st["is_dir"]==false && st["size"]==10);
    auto missing = run1(e,"FileSystem","stat",{{"path","nope.txt"}})["result"];
    CHECK(missing["exists"]==false);
    std::cout << "[PASS] test_filesystem\n";
}

static void test_filesystem_sandbox() {
    Engine e = make_engine();
    int rejected = 0;
    for (const char* bad : {"../escape.txt", "../../etc/passwd", "/etc/passwd", "sub/../../outside"}) {
        bool threw=false;
        try { run1(e,"FileSystem","read_text",{{"path",bad}}); } catch(...) { threw=true; }
        if (threw) rejected++;
        else std::cerr << "  NOT rejected: " << bad << "\n";
    }
    CHECK(rejected == 4);
    std::cout << "[PASS] test_filesystem_sandbox (all 4 escapes rejected)\n";
}

// Multi-step pipeline exercising @step.result input/output resolution across
// real capabilities: add -> multiply(@add) -> format(@multiply).
static void test_resolution_chain() {
    Engine e = make_engine();
    json p = {
        {"id","Chain"},
        {"steps", json::array({
            json{{"id","Add"},{"module_id","Math"},{"capability","add"},{"input",{{"a",2},{"b",3}}}},
            json{{"id","Mul"},{"module_id","Math"},{"capability","multiply"},{"input",{{"a","@Add.result"},{"b",10}}}},
            json{{"id","Fmt"},{"module_id","String"},{"capability","format"},
                 {"input",{{"template","value={v}"},{"args",{{"v","@Mul.result"}}}}}}
        })},
        {"edges", json::array({
            json{{"source_step","Add"},{"target_step","Mul"}},
            json{{"source_step","Mul"},{"target_step","Fmt"}}
        })}
    };
    e.load_pipelines_from_json(json{{"pipelines",json::array({p})}}.dump());
    auto res = e.run_pipeline("Chain", json::object());
    if (!res->success) { std::cerr << "chain err: " << res->error << "\n"; std::exit(1); }
    CHECK(res->outputs["Add"]["result"] == 5);
    CHECK(res->outputs["Mul"]["result"] == 50);   // (2+3)*10
    CHECK(res->outputs["Fmt"]["result"] == "value=50");
    std::cout << "[PASS] test_resolution_chain\n";
}

static void test_chain_determinism() {
    json p = {
        {"id","D"},
        {"steps", json::array({
            json{{"id","A"},{"module_id","Math"},{"capability","add"},{"input",{{"a",1},{"b",1}}}},
            json{{"id","B"},{"module_id","Math"},{"capability","multiply"},{"input",{{"a","@A.result"},{"b",3}}}},
            json{{"id","C"},{"module_id","Json"},{"capability","set"},
                 {"input",{{"data",json::object()},{"path","out.value"},{"value","@B.result"}}}}
        })},
        {"edges", json::array({
            json{{"source_step","A"},{"target_step","B"}},
            json{{"source_step","B"},{"target_step","C"}}
        })}
    };
    Engine e = make_engine(4);
    e.load_pipelines_from_json(json{{"pipelines",json::array({p})}}.dump());
    json expected;
    { auto r = e.run_pipeline("D", json::object()); CHECK(r->success); expected = r->outputs; }
    for (int i=0;i<100;i++) {
        auto r = e.run_pipeline("D", json::object());
        CHECK(r->success);
        CHECK(r->outputs == expected);
    }
    CHECK(expected["C"]["result"]["out"]["value"] == 6); // (1+1)*3
    std::cout << "[PASS] test_chain_determinism (100x identical)\n";
}

int main() {
    // Build a sandbox fixture tree.
    g_fs_root = (fs::temp_directory_path() / "sdoa_fs_test").string();
    fs::remove_all(g_fs_root);
    fs::create_directories(fs::path(g_fs_root) / "sub");
    { std::ofstream f(fs::path(g_fs_root) / "hello.txt", std::ios::binary); f << "hello sdoa"; }
    { std::ofstream f(fs::path(g_fs_root) / "data.json"); f << R"({"k":"v"})"; }

    std::cout << "=== SDOA Phase 4.1 Capability Stdlib Tests ===\n";
    test_string();
    test_math();
    test_json();
    test_system();
    test_stdlib_schemas();
    test_filesystem();
    test_filesystem_sandbox();
    test_resolution_chain();
    test_chain_determinism();
    std::cout << "\nAll stdlib tests passed.\n";

    fs::remove_all(g_fs_root);
    return 0;
}
