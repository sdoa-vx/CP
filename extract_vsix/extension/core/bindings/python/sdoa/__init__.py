# ============================================================================
# SDOA MANIFEST
# id:              "sdoa.python.binding"
# type:            "binding"
# layer:           4
# runtime:         "Python>=3.8"
# version:         "0.1.0"
# operationalRole: "language_binding"
# dependencies:    ["libsdoa (C ABI v2)"]
# docs:            "Python binding for the SDOA Engine over the C ABI. Implements
#                   the hybrid capability model: built-ins installed via C++
#                   (install_stdlib), foreign Python capabilities registered
#                   through the controlled callback ABI with determinism flags
#                   and crash isolation (JSON-only boundary)."
# ============================================================================
"""SDOA Engine — Python binding (ctypes, zero extra dependencies)."""

import ctypes
import json
import os
from ctypes.util import find_library

__all__ = ["Engine", "CapFlags", "SdoaError", "load_library"]


class CapFlags:
    """Determinism / side-effect declaration for foreign capabilities."""
    PURE = 1 << 0
    SIDE_EFFECTING = 1 << 1
    NONDETERMINISTIC = 1 << 2


class SdoaError(RuntimeError):
    pass


_OK = 0
_FOREIGN_FN = ctypes.CFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p)


class _Config(ctypes.Structure):
    _fields_ = [("api_version", ctypes.c_uint32),
                ("flags", ctypes.c_uint32),
                ("thread_count", ctypes.c_uint32)]


class _CapDesc(ctypes.Structure):
    _fields_ = [("module", ctypes.c_char_p),
                ("capability", ctypes.c_char_p),
                ("fn", _FOREIGN_FN),
                ("user_data", ctypes.c_void_p),
                ("flags", ctypes.c_uint32)]


def load_library(path=None):
    """Locate and load libsdoa. Order: explicit path -> $SDOA_LIBRARY_PATH ->
    $SDOA_LIB_DIR -> system search -> ./libsdoa.so."""
    candidates = []
    if path:
        candidates.append(path)
    if os.environ.get("SDOA_LIBRARY_PATH"):
        candidates.append(os.environ["SDOA_LIBRARY_PATH"])
    if os.environ.get("SDOA_LIB_DIR"):
        for name in ("libsdoa.so", "libsdoa.dylib", "sdoa.dll"):
            candidates.append(os.path.join(os.environ["SDOA_LIB_DIR"], name))
    found = find_library("sdoa")
    if found:
        candidates.append(found)
    candidates += ["libsdoa.so", "./libsdoa.so"]
    last = None
    for c in candidates:
        try:
            return ctypes.CDLL(c, mode=getattr(ctypes, 'RTLD_GLOBAL', 0))
        except OSError as e:
            last = e
    raise SdoaError(f"could not load libsdoa (tried {candidates}): {last}")


def _bind(lib):
    f = lib
    f.sdoa_get_api_version.restype = ctypes.c_uint32
    f.sdoa_engine_create.argtypes = [ctypes.POINTER(_Config), ctypes.POINTER(ctypes.c_void_p)]
    f.sdoa_engine_create.restype = ctypes.c_int
    f.sdoa_engine_destroy.argtypes = [ctypes.c_void_p]
    f.sdoa_engine_install_stdlib.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    f.sdoa_engine_install_stdlib.restype = ctypes.c_int
    for fn in ("sdoa_engine_load_model_from_json", "sdoa_engine_load_pipelines_from_json"):
        getattr(f, fn).argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_size_t]
        getattr(f, fn).restype = ctypes.c_int
    f.sdoa_engine_run_pipeline.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p,
                                           ctypes.c_size_t, ctypes.POINTER(ctypes.c_void_p)]
    f.sdoa_engine_run_pipeline.restype = ctypes.c_int
    f.sdoa_result_to_json.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_size_t, ctypes.POINTER(ctypes.c_size_t)]
    f.sdoa_result_to_json.restype = ctypes.c_int
    f.sdoa_result_destroy.argtypes = [ctypes.c_void_p]
    f.sdoa_get_last_error.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_size_t, ctypes.POINTER(ctypes.c_size_t)]
    f.sdoa_engine_capabilities_json.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_size_t, ctypes.POINTER(ctypes.c_size_t)]
    f.sdoa_engine_capabilities_json.restype = ctypes.c_int
    f.sdoa_engine_load_modules.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    f.sdoa_engine_load_modules.restype = ctypes.c_int
    f.sdoa_engine_modules_json.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_size_t, ctypes.POINTER(ctypes.c_size_t)]
    f.sdoa_engine_modules_json.restype = ctypes.c_int
    f.sdoa_register_foreign = f.sdoa_engine_register_foreign_capability
    f.sdoa_engine_register_foreign_capability.argtypes = [ctypes.c_void_p, ctypes.POINTER(_CapDesc)]
    f.sdoa_engine_register_foreign_capability.restype = ctypes.c_int
    f.sdoa_json_parse.argtypes = [ctypes.c_char_p, ctypes.POINTER(ctypes.c_char_p)]
    f.sdoa_json_parse.restype = ctypes.c_void_p
    f.sdoa_json_stringify.argtypes = [ctypes.c_void_p]
    f.sdoa_json_stringify.restype = ctypes.c_void_p
    f.sdoa_string_free.argtypes = [ctypes.c_void_p]
    return f


_LIB = None


def _lib():
    global _LIB
    if _LIB is None:
        _LIB = _bind(load_library())
    return _LIB


def _read_buf(call):
    """Two-call buffer protocol shared by result_to_json / capabilities_json."""
    need = ctypes.c_size_t(0)
    call(None, 0, ctypes.byref(need))
    buf = ctypes.create_string_buffer(need.value)
    call(buf, need.value, ctypes.byref(need))
    return buf.value.decode("utf-8")


class Engine:
    def __init__(self, thread_count=0, lib=None):
        self._f = _bind(lib) if lib else _lib()
        self._callbacks = []  # keep CFUNCTYPE trampolines alive for the engine's lifetime
        cfg = _Config(1, 0, int(thread_count))
        handle = ctypes.c_void_p()
        if self._f.sdoa_engine_create(ctypes.byref(cfg), ctypes.byref(handle)) != _OK:
            raise SdoaError("sdoa_engine_create failed")
        self._h = handle

    # -- lifecycle -----------------------------------------------------------
    def close(self):
        if getattr(self, "_h", None):
            self._f.sdoa_engine_destroy(self._h)
            self._h = None

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass

    def _last_error(self):
        try:
            return _read_buf(lambda b, n, r: self._f.sdoa_get_last_error(self._h, b, n, r))
        except Exception:
            return ""

    # -- built-ins (hybrid model, C++ side) ----------------------------------
    def install_stdlib(self, fs_root=None):
        root = (fs_root or "").encode("utf-8")
        if self._f.sdoa_engine_install_stdlib(self._h, root) != _OK:
            raise SdoaError("install_stdlib failed: " + self._last_error())
        return self

    # -- model / pipeline ----------------------------------------------------
    def load_model(self, model):
        data = (model if isinstance(model, str) else json.dumps(model)).encode("utf-8")
        if self._f.sdoa_engine_load_model_from_json(self._h, data, len(data)) != _OK:
            raise SdoaError("load_model failed: " + self._last_error())
        return self

    def load_pipelines(self, pipelines):
        data = (pipelines if isinstance(pipelines, str) else json.dumps(pipelines)).encode("utf-8")
        if self._f.sdoa_engine_load_pipelines_from_json(self._h, data, len(data)) != _OK:
            raise SdoaError("load_pipelines failed: " + self._last_error())
        return self

    # -- foreign capabilities (callback ABI) ---------------------------------
    def register_capability(self, module, capability, fn, flags=CapFlags.PURE):
        """Register a Python function as a foreign capability. `fn` maps a JSON
        dict -> JSON-serializable result. Exceptions are caught and surfaced to
        the engine as a structured STEP_ERROR (crash isolation)."""
        f = self._f

        def impl(input_ptr, _user_data):
            try:
                s = f.sdoa_json_stringify(input_ptr)
                try:
                    payload = json.loads(ctypes.string_at(s).decode("utf-8"))
                finally:
                    f.sdoa_string_free(s)
                out = fn(payload)
                out_bytes = json.dumps(out).encode("utf-8")
            except Exception as exc:  # never let it unwind into C++
                out_bytes = json.dumps({"__sdoa_error__": f"{type(exc).__name__}: {exc}"}).encode("utf-8")
            err = ctypes.c_char_p()
            return f.sdoa_json_parse(out_bytes, ctypes.byref(err))

        cb = _FOREIGN_FN(impl)
        self._callbacks.append(cb)  # prevent GC
        desc = _CapDesc(module.encode("utf-8"), capability.encode("utf-8"), cb, None, int(flags))
        rc = f.sdoa_engine_register_foreign_capability(self._h, ctypes.byref(desc))
        if rc != _OK:
            self._callbacks.pop()
            raise SdoaError(f"register_capability rejected (rc={rc}); check flags/identity/collision")
        return self

    # -- execution -----------------------------------------------------------
    def run(self, pipeline_id, input_data=None):
        data = json.dumps(input_data if input_data is not None else {}).encode("utf-8")
        result = ctypes.c_void_p()
        rc = self._f.sdoa_engine_run_pipeline(self._h, pipeline_id.encode("utf-8"), data, len(data), ctypes.byref(result))
        if rc != _OK or not result:
            raise SdoaError("run_pipeline failed: " + self._last_error())
        try:
            out = json.loads(_read_buf(lambda b, n, r: self._f.sdoa_result_to_json(result, b, n, r)))
        finally:
            self._f.sdoa_result_destroy(result)
        return out

    # -- introspection -------------------------------------------------------
    def capabilities(self):
        return json.loads(_read_buf(lambda b, n, r: self._f.sdoa_engine_capabilities_json(self._h, b, n, r)))

    # -- modules (Phase 6) ---------------------------------------------------
    def load_modules(self, search_path):
        """Discover and load every module under search_path (dirs with module.json)."""
        rc = self._f.sdoa_engine_load_modules(self._h, str(search_path).encode("utf-8"))
        if rc != _OK:
            raise SdoaError("load_modules failed: " + self._last_error())
        return self

    def modules(self):
        return json.loads(_read_buf(lambda b, n, r: self._f.sdoa_engine_modules_json(self._h, b, n, r)))

    def api_version(self):
        return self._f.sdoa_get_api_version()
