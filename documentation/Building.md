# Building SDOA

**Status:** Current. Covers the two supported build paths — Windows / MSVC (turnkey, zero external deps) and Linux / g++ via CMake.
**Last verified:** 2026-06-24 — full suite compiled and run on Windows with MSVC (VS 2026 / v18 Build Tools).

The engine core is deterministic and dependency-free. The only optional external dependency in the whole tree is **libsodium**, used by the CLI for ed25519 module signing — and that can be compiled out entirely (`SDOA_NO_SIGNING`), which is the default on Windows.

---

## What gets built

A single command produces the developer CLI **`sdoa`** (`sdoa.exe` on Windows), which statically links:

- the engine core (`core/` — model, pipeline, runtime, capability stdlib),
- the C ABI glue (`abi/src/sdoa_c_api.cpp`),
- the CLI front-end (`cli/main.cpp`).

The CMake build additionally produces the shared library **`libsdoa`** (`.so` / `.dll`) used by the Python, Node, and Rust bindings.

---

## Key build switches

These are compile-time `-D` / `/D` defines that control portability and dependencies:

| Define | Effect |
|---|---|
| `SDOA_STATIC` | `SDOA_API` becomes empty (no `dllexport`/`dllimport`). Required when linking the engine + ABI + CLI into **one** statically-linked executable, as the Windows build does. Omit it when building `libsdoa` as a shared library. |
| `SDOA_NO_SIGNING` | Compiles signing out of the CLI. No libsodium required. `sdoa key`/`sdoa module sign` degrade gracefully, and signed packages install as untrusted (use `--allow-unsigned`). This is the **default on Windows**. |
| `NOMINMAX` | Stops `<windows.h>` from defining `min`/`max` macros that collide with `std::min`/`std::max`. Windows only. |
| `SDOA_ABI_EXPORTS` | Marks ABI symbols `dllexport`. Used only when building the **shared** `libsdoa` (set automatically by CMake for that target). |

---

## Windows (MSVC) — recommended

Prerequisite: Visual Studio 2022 **or** 2026 (or their Build Tools) with the **"Desktop development with C++"** workload — specifically the *MSVC v143 x64/x86 build tools* component. No other libraries are needed.

```bat
cd C:\MCP\core
build.bat
```

That's it. `build.bat`:

- locates the MSVC toolchain automatically via `vswhere` and loads `vcvars64.bat` (you do **not** need the special "x64 Native Tools" prompt — a normal terminal works);
- compiles all engine + ABI + CLI sources with `/std:c++20 /EHsc /O2 /bigobj /utf-8` and `/DSDOA_STATIC /DSDOA_NO_SIGNING /DNOMINMAX`;
- produces `C:\MCP\core\sdoa.exe` (object files land in `build\`).

Verify:

```bat
sdoa.exe --help
sdoa.exe manifest
```

Notes:

- The link step uses whole-program optimization (`/O2`) and takes a few minutes. For faster iteration, drop `/O2`.
- `getenv` deprecation warnings (C4996) are expected and harmless.
- If `vswhere` can't find a C++ toolchain, the script tells you to install the C++ workload or open the "x64 Native Tools Command Prompt for VS" and re-run.

---

## Linux / macOS (g++ or clang) via CMake

Prerequisites: a C++20 compiler (g++ ≥ 10 or clang ≥ 12), CMake ≥ 3.20, and a threads library (pthreads). For signing, also `libsodium` (otherwise build with `SDOA_NO_SIGNING`).

```bash
cd /path/to/core
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
```

This builds:

- `libsdoa_core` (static engine),
- `libsdoa` (shared ABI library, built with `SDOA_ABI_EXPORTS`),
- the `sdoa` CLI,
- the test executables under `tests/`.

To build the CLI **without** signing (no libsodium needed), add the define:

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_FLAGS="-DSDOA_NO_SIGNING"
```

To enable signing, ensure libsodium is installed and link it into the CLI (the signing helpers in `cli/sign.hpp` reference the raw `crypto_sign_ed25519_*` symbols, e.g. via `-l:libsodium.so.23`).

---

## Running the tests

The C++ test suite lives in `tests/` (`test_core.cpp`, `test_stdlib.cpp`, `test_phase5x.cpp`) and the CLI end-to-end checks in `tests/cli_test.sh`. Under CMake they build alongside the rest; run them from the build directory (or invoke `cli_test.sh` against the freshly built `sdoa` binary).

---

## Bindings

The language bindings consume the shared `libsdoa`:

- **Python** — ctypes wrapper (`RTLD_GLOBAL`); point it at the built `libsdoa`.
- **Node** — koffi wrapper (inline execution).
- **Rust** — authored `sdoa-sys` + safe wrapper crate.

See `Foreign-Capability-ABI.md` and the per-binding READMEs for details.

---

## Troubleshooting

- **`D8003: missing source filename`** — an MSVC argument-parsing issue, usually a path argument ending in `\"` (a trailing backslash before a quote is read as an escaped quote). `build.bat` already strips the trailing backslash from the project root; if you hand-edit include paths, avoid `"...\"`.
- **`error LNK` / `dllimport` mismatch on Windows** — you're building a single exe without `SDOA_STATIC`. Add `/DSDOA_STATIC`.
- **Unresolved `crypto_sign_ed25519_*`** — signing is enabled but libsodium isn't linked. Either link libsodium or build with `SDOA_NO_SIGNING`.
- **`std::min`/`std::max` macro errors on Windows** — add `/DNOMINMAX`.
