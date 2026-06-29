# SDOA CLI (`sdoa`) — Phase 5.B.2

**Status:** Implemented and tested (scaffolding, validation, manifest, TypeScript codegen).
**Date:** 2026-06-24

A single portable binary (`core/cli/main.cpp`, C++20) that turns the schema engine into developer tooling. It links `libsdoa` and uses the C ABI (`sdoa_engine_install_stdlib`, `sdoa_engine_load_modules`, `sdoa_engine_capabilities_json`) plus the embedded JSON Schema validator — no new engine features required.

## Build

```bash
cmake -B build && cmake --build build      # produces build/cli/sdoa
# or directly:
g++ -std=c++20 -I. -Icore -Ithird_party -Iabi/include \
    cli/main.cpp core/runtime/schema.cpp -L<libdir> -lsdoa -o sdoa
```

Module signing additionally links libsodium (`-l:libsodium.so.23`); the engine library itself never depends on it. Run with `libsdoa` on the loader path (`LD_LIBRARY_PATH=<libdir>` on Linux).

## Commands

### Scaffolding

```bash
sdoa new module <id> [--dir modules]
```
Creates `modules/<id>/` with `module.json`, a minimal `lib/<id>.c` stub exporting `sdoa_module_register` (matching the real ABI signature), and `capabilities/`.

```bash
sdoa new capability <module> <cap> [--dir modules]
```
Adds `capabilities/<cap>.json` with `input_schema`/`output_schema` stubs, and prints the two remaining steps (register in the module library; add to `module.json` capabilities).

### Validation

```bash
sdoa validate module <path>
```
Checks `module.json` structure and required fields, that listed capabilities' schema files parse and are valid JSON-Schema-subset, and warns if the entry library is missing. Exit 0 = OK, exit 1 = structured error list.

```bash
sdoa validate pipeline <file> [--modules <dir>]
```
Builds the live manifest (stdlib + modules), then validates each pipeline: unknown capabilities, `@step.output` references targeting non-existent steps, edges referencing unknown steps, strict-mode prechecks (nondeterministic capabilities forbidden when `"strict": true`), and **static input-schema validation** for steps whose input contains no `@refs` (refs are resolved only at execution). Errors are reported as `pipeline/step: message`.

### Manifest

```bash
sdoa manifest [--modules <dir>] [--no-stdlib]
```
Spins up an embedded engine, installs the stdlib, loads modules, and prints the full capability manifest (`module`, `capability`, `flags`, and `input_schema`/`output_schema` when present). This is the source of truth for validation, codegen, IDEs, and docs.

### Codegen

```bash
sdoa codegen <ts|python|rust> <outdir> [--modules <dir>]
```

Walks the manifest and emits a typed SDK. With the full stdlib now schema-annotated, **all 32 capabilities (30 stdlib + module caps) are typed**. Each language gets: per-capability `Input`/`Output` types, a thin typed **wrapper function** producing a `PipelineStep` (no execution), and a minimal **Pipeline builder**.

**TypeScript** (`sdoa-capabilities.ts`):
```ts
export interface Math_add_Input { a: number; b: number; }
export interface Math_add_Output { result: number; }
export function math_add(input: Math_add_Input): PipelineStep {
  return { module: "Math", capability: "add", input };
}
export class Pipeline { /* .step(id, step).build() */ }
```
Authoring becomes type-checked and autocompleted:
```ts
const p = new Pipeline().step("A", math_add({ a: 2, b: 3 })).build();
```

**Python** (`sdoa_capabilities.py`): `@dataclass` Input/Output types + wrappers returning the step dict + a `Pipeline` helper.
```python
@dataclass
class Math_add_Input:
    a: float
    b: float
def math_add(inp: "Math_add_Input") -> Dict[str, Any]: ...
```

**Rust** (`sdoa_capabilities.rs`): `serde` structs + wrappers + a `Pipeline` builder.
```rust
pub struct Math_add_Input { pub a: f64, pub b: f64 }
pub fn math_add(input: Math_add_Input) -> PipelineStep { ... }
```

Optional schema fields map correctly (TS `field?:`, Python `Optional[...] = None`, Rust `Option<...>`). These are codegen outputs only — no compiler/toolchain is needed to generate them.

### Module packaging & publishing (5.B.5)

```bash
sdoa module pack <module-dir> [-o <file.sdoa>]
sdoa module install <file.sdoa | id@version> [--engine <dir>] [--registry <dir>]
sdoa module publish <module-dir> [--registry <dir>]
sdoa module search <query> [--registry <dir>]
```

A `.sdoa` package is a single deterministic JSON artifact (dependency-free — no external archiver or crypto lib):

```json
{
  "sdoa_version": 1,
  "module": { "id": "string-tools", "version": "1.0.0", "entry": "lib/...", "capabilities": [...], "sandbox": {...} },
  "files": {
    "module.json": "<utf8 text>",
    "capabilities/slugify.json": "<utf8 text>",
    "lib/libstring_tools.so": { "encoding": "base64", "data": "<base64>" }
  },
  "digest": { "algorithm": "sha256", "value": "<hex sha256 of canonicalized {sdoa_version,module,files}>" }
}
```

- **pack** validates the module first, gathers `module.json` + `capabilities/*.json` + the entry library (+ optional README/LICENSE), and writes `<id>-<version>.sdoa`. Text files are stored verbatim; the shared library is base64-encoded. The `digest` is SHA-256 over the canonicalized `{sdoa_version, module, files}` (nlohmann sorts keys → deterministic).
- **install** verifies the digest (tamper/corruption → refused), validates the module, checks version conflicts and capability collisions against already-installed modules, then unpacks into `<engine>/modules/<id>/`. Accepts a `.sdoa` file or `id@version`/`id` resolved from the registry.
- **publish** packs into a local registry (`~/.sdoa/registry/modules/<id>/<version>.sdoa`) and updates `index.json`.
- **search** queries `index.json` by id, capability, or description.

### Module lifecycle (6.2)

```bash
sdoa module list [--engine <dir>]
sdoa module remove <id> | disable <id> | enable <id> | pin <id> | unpin <id> [--engine <dir>]
```

Each engine tracks state in `<engine>/modules/index.json` (`state: active|disabled`, `pinned`, plus signing/trust). The engine loader **skips `disabled` modules**, so they vanish from the manifest while staying on disk; `list` shows the full picture (MODULE/VERSION/STATE/PINNED/TRUST). Detail in `Module-Lifecycle.md`.

The embedded SHA-256 + base64 live in `cli/pkg.hpp` (verified against the `"abc"` test vector).

### Module signing (6.4)

```bash
sdoa key generate <key_id> [-o <key.key>]
sdoa key trust <key.key|.pub> [--trust <dir>]
sdoa module sign <file.sdoa> --key <key.key> [-o <out>]
sdoa module install <file.sdoa> [--trust <dir>] [--allow-unsigned]
```

Real ed25519 (libsodium, CLI-only) signs the package **digest**. Trusted keys live in `~/.sdoa/trust/keys/`. Unsigned modules install only if they request no elevated intent; elevated intents (`network`, `fs: read-write`, `clock`, `random`, `unsafe`) require a signed + trusted module. Errors: `SIGNATURE_INVALID`, `SIGNATURE_UNTRUSTED_KEY`, `SIGNATURE_REQUIRED_FOR_ELEVATED_INTENT`. Full detail and the honest boundary (signing ≠ syscall sandboxing) in `Module-Signing.md`.

### Dashboard (5.B.6)

```bash
sdoa dashboard <outdir> [--engine <dir>] [--traces <dir>] [--registry <dir>]
```

Emits a **static, zero-dependency** dashboard bundle (no bundler, framework, or CDN):

```
<outdir>/
  index.html      dashboard.js      dashboard.css
  manifest.json   modules.json      data.js
  traces/index.json   traces/<copied traces>.json
```

Four panels in `dashboard.js` (plain DOM, deterministic): **Capabilities** (per-module tree → schema tables + TS/Python/Rust example snippets), **Pipeline Visualizer** (load a pipeline JSON → SVG DAG; unknown caps red, nondeterministic-in-strict orange; click a node for its schemas), **Modules** (Installed/Registry tabs from `modules.json`), and **Traces** (event list with inputs/outputs/errors per step).

`manifest.json` comes from the engine (`capabilities_json`); `modules.json` is scanned from `<engine>/modules` (installed) plus the registry `index.json`. Browsers block `fetch` on `file://`, so the same data is also inlined into `data.js` (`window.SDOA_EMBED`) — the dashboard reads that, making the bundle work by double-clicking `index.html` with no server. Everything is local, deterministic, and sovereign.

### Auto-docs (5.B.7.1)

```bash
sdoa docs <outdir> [--modules <dir>]
```

Generates a complete capability reference from the manifest:

```
<outdir>/
  index.md                              # all modules + capabilities, linked
  modules/<id>.md                       # per-module capability table (with flags)
  capabilities/<module>.<cap>.md        # metadata + input/output schema tables + TS/Python/Rust examples
  schemas/<module>.<cap>.json           # {input_schema, output_schema}
```

Every page is derived from the typed manifest, so the docs stay in sync with the engine. (32 capabilities → 71 files for the stdlib + string-tools + math-tools.)

### Tutorials & examples

`documentation/tutorials/` ships the starter guides: write your first capability, build your first module, use SDOA from TS/Python/Rust, and validate pipelines before execution. Working example modules live under `core/modules/`: **string-tools** (`upper`, `slugify`) and **math-tools** (`factorial`, `gcd`, `fibonacci`) — both pure, schema-typed, and packable with `sdoa module pack`.

## Tests

`core/tests/cli_test.sh` exercises every command (scaffold structure, validation catching missing fields / schema violations / bad refs, manifest contents, codegen output). All pass.

## Notes & next steps

- Logically organized as one file with clear sections; can be split into `commands/*.cpp` later as the spec envisions.
- Built-in stdlib capabilities don't yet carry schemas, so codegen currently emits interfaces for module/foreign capabilities that declare them. Adding schemas to the stdlib (progressive) makes the whole surface typed.
- Natural follow-ups (5.B.x): full Python/Rust codegen, module packaging/publishing, and the dashboard/introspection UIs.
