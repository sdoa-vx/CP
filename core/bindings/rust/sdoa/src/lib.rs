//! Safe Rust binding for the SDOA Engine.
//!
//! Hybrid capability model: built-ins are installed via [`Engine::install_stdlib`];
//! foreign Rust capabilities register via [`Engine::register_capability`] through
//! the C callback ABI with explicit determinism flags and panic isolation
//! (a panicking capability becomes a structured `STEP_ERROR`, never UB).
use serde_json::{json, Value};
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_void};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::ptr;

pub use sdoa_sys as sys;

/// Determinism / side-effect declaration for foreign capabilities.
#[derive(Clone, Copy)]
pub struct CapFlags;
impl CapFlags {
    pub const PURE: u32 = sys::SDOA_CAP_PURE;
    pub const SIDE_EFFECTING: u32 = sys::SDOA_CAP_SIDE_EFFECTING;
    pub const NONDETERMINISTIC: u32 = sys::SDOA_CAP_NONDETERMINISTIC;
}

#[derive(Debug)]
pub struct SdoaError(pub String);
impl std::fmt::Display for SdoaError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { write!(f, "{}", self.0) }
}
impl std::error::Error for SdoaError {}
type Result<T> = std::result::Result<T, SdoaError>;

type DynCap = Box<dyn Fn(Value) -> Value>;

// Single non-generic trampoline. `user_data` points to a heap `DynCap`.
unsafe extern "C" fn trampoline(input: *const sys::sdoa_json, user_data: *mut c_void) -> *mut sys::sdoa_json {
    let out_str = catch_unwind(AssertUnwindSafe(|| {
        let f = &*(user_data as *const DynCap);
        let sptr = sys::sdoa_json_stringify(input);
        let s = CStr::from_ptr(sptr).to_string_lossy().into_owned();
        sys::sdoa_string_free(sptr);
        let v: Value = serde_json::from_str(&s).unwrap_or(Value::Null);
        let out = f(v);
        serde_json::to_string(&out).unwrap_or_else(|_| "null".into())
    }))
    .unwrap_or_else(|_| serde_json::to_string(&json!({"__sdoa_error__": "rust capability panicked"})).unwrap());

    match CString::new(out_str) {
        Ok(c) => {
            let mut err: *const c_char = ptr::null();
            sys::sdoa_json_parse(c.as_ptr(), &mut err)
        }
        Err(_) => ptr::null_mut(),
    }
}

pub struct Engine {
    h: sys::SDOA_EngineHandle,
    callbacks: Vec<*mut c_void>, // owned DynCap pointers, freed on Drop
}

impl Engine {
    /// Create an engine. `inline = true` runs pipelines on the calling thread
    /// (recommended whenever you register Rust capabilities, so the callback
    /// runs on a thread you control).
    pub fn new(thread_count: u32, inline: bool) -> Result<Self> {
        let cfg = sys::SDOA_Config {
            api_version: 1,
            flags: if inline { sys::SDOA_FLAG_INLINE } else { 0 },
            thread_count,
        };
        let mut h: sys::SDOA_EngineHandle = ptr::null_mut();
        let rc = unsafe { sys::sdoa_engine_create(&cfg, &mut h) };
        if rc != sys::SDOA_OK || h.is_null() {
            return Err(SdoaError("sdoa_engine_create failed".into()));
        }
        Ok(Engine { h, callbacks: Vec::new() })
    }

    fn last_error(&self) -> String { read_buf(|b, n, r| unsafe { sys::sdoa_get_last_error(self.h, b, n, r) }) }

    pub fn install_stdlib(&mut self, fs_root: Option<&str>) -> Result<()> {
        let c = CString::new(fs_root.unwrap_or("")).unwrap();
        let rc = unsafe { sys::sdoa_engine_install_stdlib(self.h, c.as_ptr()) };
        if rc != sys::SDOA_OK { return Err(SdoaError(format!("install_stdlib: {}", self.last_error()))); }
        Ok(())
    }

    pub fn load_model(&mut self, model: &Value) -> Result<()> { self.load(model, true) }
    pub fn load_pipelines(&mut self, pipelines: &Value) -> Result<()> { self.load(pipelines, false) }

    fn load(&mut self, v: &Value, model: bool) -> Result<()> {
        let s = serde_json::to_string(v).map_err(|e| SdoaError(e.to_string()))?;
        let c = CString::new(s).unwrap();
        let len = c.as_bytes().len();
        let rc = unsafe {
            if model { sys::sdoa_engine_load_model_from_json(self.h, c.as_ptr(), len) }
            else { sys::sdoa_engine_load_pipelines_from_json(self.h, c.as_ptr(), len) }
        };
        if rc != sys::SDOA_OK { return Err(SdoaError(self.last_error())); }
        Ok(())
    }

    /// Register a foreign Rust capability. `f` maps input JSON -> output JSON.
    pub fn register_capability<F>(&mut self, module: &str, capability: &str, flags: u32, f: F) -> Result<()>
    where F: Fn(Value) -> Value + 'static {
        let cap: DynCap = Box::new(f);
        let ud = Box::into_raw(Box::new(cap)) as *mut c_void; // *mut DynCap
        let cmod = CString::new(module).unwrap();
        let ccap = CString::new(capability).unwrap();
        let desc = sys::sdoa_cap_desc {
            module: cmod.as_ptr(),
            capability: ccap.as_ptr(),
            fn_ptr: Some(trampoline),
            user_data: ud,
            flags,
        };
        let rc = unsafe { sys::sdoa_engine_register_foreign_capability(self.h, &desc) };
        if rc != sys::SDOA_OK {
            unsafe { drop(Box::from_raw(ud as *mut DynCap)); } // not retained -> free now
            return Err(SdoaError(format!("register_capability rejected (rc={rc})")));
        }
        self.callbacks.push(ud);
        Ok(())
    }

    pub fn run(&self, pipeline_id: &str, input: &Value) -> Result<Value> {
        let pid = CString::new(pipeline_id).unwrap();
        let inp = CString::new(serde_json::to_string(input).unwrap()).unwrap();
        let mut res: sys::SDOA_ResultHandle = ptr::null_mut();
        let rc = unsafe { sys::sdoa_engine_run_pipeline(self.h, pid.as_ptr(), inp.as_ptr(), inp.as_bytes().len(), &mut res) };
        if rc != sys::SDOA_OK || res.is_null() { return Err(SdoaError(self.last_error())); }
        let s = read_buf(|b, n, r| unsafe { sys::sdoa_result_to_json(res, b, n, r) });
        unsafe { sys::sdoa_result_destroy(res) };
        serde_json::from_str(&s).map_err(|e| SdoaError(e.to_string()))
    }

    pub fn capabilities(&self) -> Result<Value> {
        let s = read_buf(|b, n, r| unsafe { sys::sdoa_engine_capabilities_json(self.h, b, n, r) });
        serde_json::from_str(&s).map_err(|e| SdoaError(e.to_string()))
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        unsafe { sys::sdoa_engine_destroy(self.h); }
        for ud in self.callbacks.drain(..) {
            unsafe { drop(Box::from_raw(ud as *mut DynCap)); }
        }
    }
}

// Two-call buffer protocol shared by result/capabilities readers.
fn read_buf<F>(mut call: F) -> String
where F: FnMut(*mut c_char, usize, *mut usize) -> sys::SDOA_Status {
    let mut need: usize = 0;
    call(ptr::null_mut(), 0, &mut need);
    let mut buf = vec![0u8; need];
    call(buf.as_mut_ptr() as *mut c_char, buf.len(), &mut need);
    if let Some(z) = buf.iter().position(|&b| b == 0) { buf.truncate(z); }
    String::from_utf8_lossy(&buf).into_owned()
}
