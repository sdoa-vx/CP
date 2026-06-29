//! Raw FFI bindings to the SDOA Engine C ABI (v2). Unsafe; prefer the `sdoa` crate.
#![allow(non_camel_case_types)]
use std::os::raw::{c_char, c_void};

#[repr(C)] pub struct SDOA_Engine_ { _p: [u8; 0] }
#[repr(C)] pub struct SDOA_Result_ { _p: [u8; 0] }
#[repr(C)] pub struct sdoa_json   { _p: [u8; 0] }

pub type SDOA_EngineHandle = *mut SDOA_Engine_;
pub type SDOA_ResultHandle = *mut SDOA_Result_;

pub type SDOA_Status = i32;
pub const SDOA_OK: SDOA_Status = 0;

pub const SDOA_FLAG_INLINE: u32 = 1;

pub const SDOA_CAP_PURE: u32 = 1 << 0;
pub const SDOA_CAP_SIDE_EFFECTING: u32 = 1 << 1;
pub const SDOA_CAP_NONDETERMINISTIC: u32 = 1 << 2;

#[repr(C)]
pub struct SDOA_Config {
    pub api_version: u32,
    pub flags: u32,
    pub thread_count: u32,
}

pub type sdoa_foreign_fn =
    unsafe extern "C" fn(input: *const sdoa_json, user_data: *mut c_void) -> *mut sdoa_json;

#[repr(C)]
pub struct sdoa_cap_desc {
    pub module: *const c_char,
    pub capability: *const c_char,
    pub fn_ptr: Option<sdoa_foreign_fn>,
    pub user_data: *mut c_void,
    pub flags: u32,
}

extern "C" {
    pub fn sdoa_get_api_version() -> u32;
    pub fn sdoa_engine_create(config: *const SDOA_Config, out: *mut SDOA_EngineHandle) -> SDOA_Status;
    pub fn sdoa_engine_destroy(engine: SDOA_EngineHandle) -> SDOA_Status;
    pub fn sdoa_engine_install_stdlib(engine: SDOA_EngineHandle, fs_root: *const c_char) -> SDOA_Status;
    pub fn sdoa_engine_load_model_from_json(engine: SDOA_EngineHandle, json: *const c_char, len: usize) -> SDOA_Status;
    pub fn sdoa_engine_load_pipelines_from_json(engine: SDOA_EngineHandle, json: *const c_char, len: usize) -> SDOA_Status;
    pub fn sdoa_engine_run_pipeline(engine: SDOA_EngineHandle, pipeline_id: *const c_char, input_json: *const c_char, input_len: usize, out_result: *mut SDOA_ResultHandle) -> SDOA_Status;
    pub fn sdoa_result_to_json(result: SDOA_ResultHandle, buffer: *mut c_char, buffer_size: usize, out_required: *mut usize) -> SDOA_Status;
    pub fn sdoa_result_destroy(result: SDOA_ResultHandle) -> SDOA_Status;
    pub fn sdoa_get_last_error(engine: SDOA_EngineHandle, buffer: *mut c_char, buffer_size: usize, out_required: *mut usize) -> SDOA_Status;
    pub fn sdoa_engine_capabilities_json(engine: SDOA_EngineHandle, buffer: *mut c_char, buffer_size: usize, out_required: *mut usize) -> SDOA_Status;
    pub fn sdoa_engine_register_foreign_capability(engine: SDOA_EngineHandle, desc: *const sdoa_cap_desc) -> SDOA_Status;
    pub fn sdoa_json_parse(utf8: *const c_char, err_msg: *mut *const c_char) -> *mut sdoa_json;
    pub fn sdoa_json_stringify(j: *const sdoa_json) -> *mut c_char;
    pub fn sdoa_json_free(j: *mut sdoa_json);
    pub fn sdoa_string_free(s: *mut c_char);
}
