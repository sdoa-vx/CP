use axum::{routing::get, Json, Router};
use reqwest::Client;
use serde_json::{json, Value};
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::time;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("[Oracle] Starting sovereign routing oracle...");

    // Background task: Fetch from Pulse
    tokio::spawn(async move {
        let client = Client::new();
        let mut interval = time::interval(Duration::from_secs(5));
        loop {
            interval.tick().await;
            // E.g., pull /pulse/scores
            let _ = client.get("http://localhost:8082/pulse/scores").send().await;
            let _ = client.get("http://localhost:8082/pulse/drift").send().await;
        }
    });

    // HTTP Server for Node.js Engine Core (Triage)
    let app = Router::new()
        .route("/oracle/surface", get(dump_surface))
        .route("/oracle/drift_penalty", get(get_drift_penalty));

    let listener = TcpListener::bind("127.0.0.1:8083").await?;
    println!("[Oracle] Listening on 127.0.0.1:8083");
    axum::serve(listener, app).await?;

    Ok(())
}

async fn dump_surface() -> Json<Value> {
    // Return the routing capabilities surface for Triage
    Json(json!([]))
}

async fn get_drift_penalty() -> Json<Value> {
    // Return drift penalty (e.g., 0)
    Json(json!({ "penalty": 0 }))
}
