// ============================================================================
// SDOA MANIFEST
// id:              "sdoa.node.binding"
// type:            "binding"
// layer:           4
// runtime:         "Node>=18"
// version:         "0.1.0"
// operationalRole: "language_binding"
// dependencies:    ["koffi", "libsdoa (C ABI v2)"]
// docs:            "Node.js binding for the SDOA Engine over the C ABI via koffi.
//                   Hybrid capability model: built-ins via install_stdlib;
//                   foreign JS capabilities via the callback ABI with
//                   determinism flags and crash isolation (JSON-only boundary)."
// ============================================================================
'use strict';
const koffi = require('koffi');
const path = require('path');

const CapFlags = Object.freeze({ PURE: 1, SIDE_EFFECTING: 2, NONDETERMINISTIC: 4 });

function resolveLibPath(explicit) {
  if (explicit) return explicit;
  if (process.env.SDOA_LIBRARY_PATH) return process.env.SDOA_LIBRARY_PATH;
  if (process.env.SDOA_LIB_DIR) return path.join(process.env.SDOA_LIB_DIR, 'libsdoa.so');
  return 'libsdoa.so';
}

let _F = null;
function bind(libPath) {
  if (_F) return _F;
  const lib = koffi.load(resolveLibPath(libPath));
  const Config = koffi.struct('SDOA_Config', { api_version: 'uint32', flags: 'uint32', thread_count: 'uint32' });
  const ForeignFn = koffi.proto('sdoa_foreign_fn', 'void *', ['void *', 'void *']);
  const CapDesc = koffi.struct('sdoa_cap_desc', {
    module: 'str', capability: 'str', fn: 'void *', user_data: 'void *', flags: 'uint32'
  });
  _F = {
    koffi, lib, Config, ForeignFn, CapDesc,
    api_version: lib.func('sdoa_get_api_version', 'uint32', []),
    create: lib.func('sdoa_engine_create', 'int', [koffi.pointer(Config), koffi.out(koffi.pointer('void *'))]),
    destroy: lib.func('sdoa_engine_destroy', 'int', ['void *']),
    install_stdlib: lib.func('sdoa_engine_install_stdlib', 'int', ['void *', 'str']),
    load_model: lib.func('sdoa_engine_load_model_from_json', 'int', ['void *', 'str', 'size_t']),
    load_pipelines: lib.func('sdoa_engine_load_pipelines_from_json', 'int', ['void *', 'str', 'size_t']),
    run: lib.func('sdoa_engine_run_pipeline', 'int', ['void *', 'str', 'str', 'size_t', koffi.out(koffi.pointer('void *'))]),
    result_to_json: lib.func('sdoa_result_to_json', 'int', ['void *', 'void *', 'size_t', koffi.out(koffi.pointer('size_t'))]),
    result_destroy: lib.func('sdoa_result_destroy', 'int', ['void *']),
    last_error: lib.func('sdoa_get_last_error', 'int', ['void *', 'void *', 'size_t', koffi.out(koffi.pointer('size_t'))]),
    caps_json: lib.func('sdoa_engine_capabilities_json', 'int', ['void *', 'void *', 'size_t', koffi.out(koffi.pointer('size_t'))]),
    register_foreign: lib.func('sdoa_engine_register_foreign_capability', 'int', ['void *', koffi.pointer(CapDesc)]),
    json_parse: lib.func('sdoa_json_parse', 'void *', ['str', 'void *']),
    json_stringify: lib.func('sdoa_json_stringify', 'void *', ['void *']),
    string_free: lib.func('sdoa_string_free', 'void', ['void *']),
  };
  return _F;
}

function readBuf(call) {
  const need = [0];
  call(null, 0, need);
  const buf = Buffer.alloc(need[0]);
  call(buf, buf.length, need);
  const nul = buf.indexOf(0);
  return buf.toString('utf8', 0, nul >= 0 ? nul : buf.length);
}

class SdoaError extends Error {}

class Engine {
  constructor(opts = {}) {
    this._f = bind(opts.libPath);
    this._callbacks = []; // keep koffi callbacks alive
    // Node's JS runtime is single-threaded; force inline execution so foreign JS
    // capability callbacks run on the calling thread (SDOA_FLAG_INLINE = 1).
    const cfg = { api_version: 1, flags: 1, thread_count: opts.threadCount || 0 };
    const h = [null];
    if (this._f.create(cfg, h) !== 0) throw new SdoaError('sdoa_engine_create failed');
    this._h = h[0];
  }
  _lastError() { try { return readBuf((b, n, r) => this._f.last_error(this._h, b, n, r)); } catch { return ''; } }
  close() { if (this._h) { this._f.destroy(this._h); this._h = null; } }
  apiVersion() { return this._f.api_version(); }

  installStdlib(fsRoot = '') {
    if (this._f.install_stdlib(this._h, fsRoot || '') !== 0) throw new SdoaError('install_stdlib: ' + this._lastError());
    return this;
  }
  loadModel(model) {
    const s = typeof model === 'string' ? model : JSON.stringify(model);
    if (this._f.load_model(this._h, s, Buffer.byteLength(s)) !== 0) throw new SdoaError('loadModel: ' + this._lastError());
    return this;
  }
  loadPipelines(p) {
    const s = typeof p === 'string' ? p : JSON.stringify(p);
    if (this._f.load_pipelines(this._h, s, Buffer.byteLength(s)) !== 0) throw new SdoaError('loadPipelines: ' + this._lastError());
    return this;
  }
  registerCapability(module, capability, fn, flags = CapFlags.PURE) {
    const f = this._f;
    const impl = (inputPtr) => {
      let outBytes;
      try {
        const sptr = f.json_stringify(inputPtr);
        const s = koffi.decode(sptr, 'char', -1);
        f.string_free(sptr);
        const out = fn(JSON.parse(s));
        outBytes = JSON.stringify(out);
      } catch (e) {
        outBytes = JSON.stringify({ __sdoa_error__: `${e && e.name || 'Error'}: ${e && e.message || e}` });
      }
      return f.json_parse(outBytes, null);
    };
    const cb = koffi.register(impl, koffi.pointer(f.ForeignFn));
    this._callbacks.push(cb);
    const rc = f.register_foreign(this._h, { module, capability, fn: cb, user_data: null, flags });
    if (rc !== 0) { this._callbacks.pop(); throw new SdoaError(`registerCapability rejected (rc=${rc})`); }
    return this;
  }
  run(pipelineId, input = {}) {
    const s = JSON.stringify(input);
    const out = [null];
    const rc = this._f.run(this._h, pipelineId, s, Buffer.byteLength(s), out);
    if (rc !== 0 || !out[0]) throw new SdoaError('run: ' + this._lastError());
    try { return JSON.parse(readBuf((b, n, r) => this._f.result_to_json(out[0], b, n, r))); }
    finally { this._f.result_destroy(out[0]); }
  }
  capabilities() { return JSON.parse(readBuf((b, n, r) => this._f.caps_json(this._h, b, n, r))); }
}

module.exports = { Engine, CapFlags, SdoaError };
