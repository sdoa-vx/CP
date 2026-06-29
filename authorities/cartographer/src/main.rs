use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::time;

#[derive(Debug, Deserialize, Serialize)]
struct Event {
    #[serde(rename = "ModuleID")]
    module_id: String,
    #[serde(rename = "EventType")]
    event_type: String,
    #[serde(rename = "Timestamp")]
    timestamp: String,
    // Note: Payload omitted for simplicity in this scaffold
}

#[derive(Debug, Deserialize, Serialize)]
struct WindowSlice {
    #[serde(rename = "Start")]
    start: String,
    #[serde(rename = "End")]
    end: String,
    #[serde(rename = "Events")]
    events: Vec<Event>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("[Cartographer] Starting drift regression daemon...");
    let client = Client::new();
    let mut interval = time::interval(Duration::from_secs(10));

    loop {
        interval.tick().await;
        // Fetch from Chronicle for all windows (using a known ID like Triage.workflow for testing)
        let res = client
            .get("http://localhost:8081/chronicle/windows/Triage.workflow")
            .send()
            .await;

        match res {
            Ok(response) => {
                if response.status().is_success() {
                    if let Ok(windows) = response.json::<Vec<WindowSlice>>().await {
                        println!("[Cartographer] Fetched {} window slices. Computing drift forecast...", windows.len());
                    }
                }
            }
            Err(e) => {
                println!("[Cartographer] Failed to connect to Chronicle: {}", e);
            }
        }
    }
}
