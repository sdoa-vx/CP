// Build/run: SDOA_LIB_DIR=/path/to/libdir cargo run --example quickstart
// (ensure libsdoa is also on the dynamic loader path, e.g. LD_LIBRARY_PATH).
use serde_json::json;
use sdoa::{Engine, CapFlags};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut e = Engine::new(0, true)?; // inline: callback runs on this thread
    e.install_stdlib(None)?;
    e.register_capability("My", "shout", CapFlags::PURE, |i| {
        json!({ "result": format!("{}!", i["text"].as_str().unwrap_or("").to_uppercase()) })
    })?;
    e.load_model(&json!({"domains":[{"id":"D","modules":[
        {"id":"String","capabilities":[{"name":"concat"}],"dependencies":[],"invariants":[]},
        {"id":"My","capabilities":[{"name":"shout"}],"dependencies":[],"invariants":[]}
    ]}]}))?;
    e.load_pipelines(&json!({"pipelines":[{"id":"Greet","steps":[
        {"id":"J","module_id":"String","capability":"concat","input":{"parts":["hello","sdoa"],"sep":" "}},
        {"id":"S","module_id":"My","capability":"shout","input":{"text":"@J.result"}}
    ],"edges":[{"source_step":"J","target_step":"S"}]}]}))?;
    let out = e.run("Greet", &json!({}))?;
    println!("{}", out["outputs"]["S"]["result"]); // -> HELLO SDOA!
    Ok(())
}
