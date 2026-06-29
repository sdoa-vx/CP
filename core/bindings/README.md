# SDOA Engine — Language Bindings (Phase 5)

Bindings sit on top of the SDOA C ABI v2 (`abi/include/sdoa.h`, built as `libsdoa`). All implement the hybrid capability model: install the C++ built-in stdlib, register host-language foreign capabilities through the controlled callback ABI (JSON-only, determinism flags, crash isolation). See `documentation/Foreign-Capability-ABI.md` for the contract.

## Status (Phase 5, Tier 1)

| Binding | FFI | Foreign capabilities | Status |
|---------|-----|----------------------|--------|
| **Python** (`python/`) | ctypes (stdlib, no deps) | Yes (GIL-safe on worker threads) | **Built & tested** |
| **Node** (`node/`) | koffi | Yes (via inline execution) | **Built & tested** |
| **Rust** (`rust/`) | hand-written `sdoa-sys` + safe `sdoa` | Yes (panic-isolated) | **Authored** — compile with `cargo` (no Rust toolchain in the build sandbox used this session) |

All three were validated against the same behaviors: built-in capability execution, a foreign capability inside a mixed pipeline using `@step.result` resolution, foreign error/crash isolation → structured `STEP_ERROR`, 100× determinism, and the compliance gate (flag rules + built-in-collision rejection).

## Building the shared library

```bash
# From the repo root (the "sdoa/" tree). Produces libsdoa.so (Linux).
# (CMake target sdoa_abi builds it; or compile core + capabilities + abi/src with -fPIC -shared.)
cmake -B build && cmake --build build       # yields build/.../libsdoa.so
```

Point the bindings at it via `SDOA_LIBRARY_PATH` (full path) or `SDOA_LIB_DIR` (directory), and ensure it's on the OS loader path (`LD_LIBRARY_PATH` on Linux).

## Python

```bash
cd bindings/python
SDOA_LIBRARY_PATH=/path/to/libsdoa.so python3 tests/test_sdoa.py
SDOA_LIBRARY_PATH=/path/to/libsdoa.so PYTHONPATH=. python3 examples/quickstart.py
```
```python
from sdoa import Engine, CapFlags
with Engine(thread_count=2) as e:
    e.install_stdlib()
    e.register_capability("My", "shout", lambda i: {"result": i["text"].upper()}, CapFlags.PURE)
    ...
```

## Node

```bash
cd bindings/node && npm install            # installs koffi
SDOA_LIBRARY_PATH=/path/to/libsdoa.so node test.js
```
```js
const { Engine, CapFlags } = require("./index.js");
const e = new Engine({ threadCount: 2 });   // inline execution forced for JS safety
e.installStdlib();
e.registerCapability("My", "shout", (i) => ({ result: i.text.toUpperCase() }), CapFlags.PURE);
```
Node uses inline execution automatically (single-threaded runtime — see ABI doc §7).

## Rust

```bash
cd bindings/rust
SDOA_LIB_DIR=/path/to/libdir LD_LIBRARY_PATH=/path/to/libdir cargo run --example quickstart
```
```rust
let mut e = sdoa::Engine::new(0, /*inline*/ true)?;
e.install_stdlib(None)?;
e.register_capability("My", "shout", sdoa::CapFlags::PURE, |i| {
    serde_json::json!({ "result": i["text"].as_str().unwrap_or("").to_uppercase() })
})?;
```

## Tier 2 / Tier 3 (future)

Go, C#/.NET, Java/Kotlin (Tier 2); Swift, Zig, WASM (Tier 3). All target the same C ABI v2.
