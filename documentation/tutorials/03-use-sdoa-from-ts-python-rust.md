# Use SDOA from TypeScript / Python / Rust

The engine ships a stable C ABI (`libsdoa`). Generate typed SDKs from the manifest, then author pipelines with full type-checking. All capabilities (stdlib + modules) are schema-typed, so codegen covers the whole surface.

## Generate typed SDKs

```bash
sdoa codegen ts     ./gen --modules ./modules
sdoa codegen python ./gen --modules ./modules
sdoa codegen rust   ./gen --modules ./modules
```

Each emits per-capability `Input`/`Output` types, a typed wrapper function per capability (producing a `PipelineStep` — no execution), and a minimal `Pipeline` builder.

## TypeScript

```ts
import { Pipeline, math_add } from "./gen/sdoa-capabilities";
const pipeline = new Pipeline()
  .step("A", math_add({ a: 2, b: 3 }))   // type-checked input
  .build();
// hand `pipeline` JSON to the engine via your binding / the C ABI
```

## Python (binding + codegen)

```python
from sdoa import Engine                 # bindings/python
from gen.sdoa_capabilities import Math_add_Input, math_add
e = Engine(thread_count=2); e.install_stdlib()
e.load_model({...}); e.load_pipelines({"pipelines":[{"id":"P","steps":[math_add(Math_add_Input(a=2,b=3)) | {"id":"A"}], "edges":[]}]})
```

The Python and Node bindings (`bindings/python`, `bindings/node`) also let you register **foreign** capabilities in the host language. Node uses inline execution so JS callbacks run on the calling thread; Python's GIL makes worker-thread callbacks safe.

## Rust

```rust
// bindings/rust: sdoa-sys (raw FFI) + sdoa (safe wrapper)
let mut e = sdoa::Engine::new(0, /*inline*/ true)?;
e.install_stdlib(None)?;
// or use gen/sdoa_capabilities.rs typed wrappers + Pipeline builder
```

Point any binding at `libsdoa` via `SDOA_LIBRARY_PATH` (or `SDOA_LIB_DIR`). Build the shared library with CMake (`cmake -B build && cmake --build build`).

Next: [Validate pipelines before execution](04-validate-pipelines.md).
