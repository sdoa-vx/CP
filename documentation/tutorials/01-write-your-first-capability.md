# Write your first capability

A capability is a pure function `JSON -> JSON`. Built-in capabilities are registered in C++; foreign ones come from any language over the C ABI. This tutorial uses the built-in path.

```cpp
#include "core/runtime/engine.hpp"
using namespace sdoa;

Engine e(EngineConfig{.thread_count = 1});

// 1. Register a capability: module "My", capability "greet".
e.register_capability("My", "greet", [](const nlohmann::json& in) {
    return nlohmann::json{{"result", "hello " + in.value("name", std::string("world"))}};
});

// 2. Declare it in a model and a pipeline.
e.load_model_from_json(R"({"domains":[{"id":"D","modules":[
  {"id":"My","capabilities":[{"name":"greet"}],"dependencies":[],"invariants":[]}]}]})");
e.load_pipelines_from_json(R"({"pipelines":[{"id":"P",
  "steps":[{"id":"S","module_id":"My","capability":"greet","input":{"name":"Tre"}}],"edges":[]}]})");

// 3. Run it.
auto res = e.run_pipeline("P", nlohmann::json::object());
// res->outputs["S"]["result"] == "hello Tre"
```

Key rules: a capability is **pure and deterministic** (same input → same output, no hidden state), the boundary is **JSON only**, and every value flows by `@step.output` references between steps. Attach schemas with `e.set_capability_schema("My","greet", input_schema, output_schema)` to get validation and typed codegen for free.

Next: [Build your first module](02-build-your-first-module.md) to ship a capability as a loadable artifact.
