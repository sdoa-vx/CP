# Build your first module

A module packages capabilities as a loadable `.so`/`.dll`/`.dylib` plus a manifest. The engine discovers and loads it at runtime — no recompilation of the engine.

## 1. Scaffold

```bash
sdoa new module my-tools
sdoa new capability my-tools shout
```

This creates:

```
modules/my-tools/
  module.json
  lib/my-tools.c          # stub exporting sdoa_module_register
  capabilities/shout.json # input_schema / output_schema stubs
```

## 2. Implement the capability

Edit the module library to register `shout` (see `modules/string-tools/src/string_tools.cpp` and `modules/math-tools/src/math_tools.cpp` for working C++ examples). A capability reads its input via `sdoa_json_stringify`, computes a result, and returns a new handle via `sdoa_json_parse`. Catch your own errors and return `{"__sdoa_error__": "..."}` or `NULL` — nothing may unwind into the engine.

Add `"shout"` to `module.json`'s `capabilities`, and build the library (no `-lsdoa`; the `sdoa_*` symbols resolve from the host at load time):

```bash
g++ -std=c++20 -fPIC -shared -I <repo>/abi/include -I <repo>/third_party \
    modules/my-tools/src/*.cpp -o modules/my-tools/lib/libmy_tools.so
```

## 3. Validate, pack, install

```bash
sdoa validate module modules/my-tools
sdoa module pack modules/my-tools -o my-tools-1.0.0.sdoa
sdoa module install my-tools-1.0.0.sdoa --engine ./my-engine
```

The loader reads `capabilities/*.json` and **injects your schemas** onto the registered capabilities automatically — no `.so` changes needed. Now any engine pointed at that modules directory can run `my-tools::shout`.

Next: [Validate pipelines before execution](04-validate-pipelines.md).
