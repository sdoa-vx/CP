use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::time::Duration;
use tokio::time;
use uuid::Uuid;

#[derive(Deserialize, Debug)]
struct Proposal {
    id: String,
    cluster_id: Option<String>,
    module_suggestion: Option<String>,
    state: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("[Registrar] Starting lineage recording authority...");
    let client = Client::new();
    let mut interval = time::interval(Duration::from_secs(10));

    let supabase_url = env::var("SUPABASE_URL").unwrap_or_default();
    let supabase_key = env::var("SUPABASE_KEY").unwrap_or_default();

    loop {
        interval.tick().await;

        if supabase_url.is_empty() || supabase_key.is_empty() {
            println!("[Registrar] SUPABASE_URL or SUPABASE_KEY missing, skipping proposal poll.");
            continue;
        }

        if let Ok(proposals) = fetch_pending_proposals(&client, &supabase_url, &supabase_key).await {
            for p in proposals {
                println!("[Registrar] Processing proposal: {}", p.id);
                // Scaffold: Generate lineage
                let lineage_tree = json!({
                    "version": "1.0.0",
                    "parent": "triage.workflow",
                    "status": "recorded"
                });

                // Write lineage
                let _ = write_lineage(
                    &client,
                    &supabase_url,
                    &supabase_key,
                    &p.id,
                    p.module_suggestion.as_deref().unwrap_or("unknown_module"),
                    "triage.workflow",
                    lineage_tree.clone(),
                )
                .await;

                // Write governance event
                let _ = write_governance_event(
                    &client,
                    &supabase_url,
                    &supabase_key,
                    &p.id,
                    "registrar",
                    "lineage_recorded",
                    json!({ "lineage": lineage_tree }),
                )
                .await;
            }
        }
    }
}

async fn fetch_pending_proposals(
    client: &Client,
    url: &str,
    key: &str,
) -> Result<Vec<Proposal>, Box<dyn std::error::Error>> {
    let res = client
        .get(format!("{}/rest/v1/proposals?state=eq.pending", url))
        .header("apikey", key)
        .header("Authorization", format!("Bearer {}", key))
        .send()
        .await?;

    let proposals: Vec<Proposal> = res.json().await?;
    Ok(proposals)
}

async fn write_lineage(
    client: &Client,
    url: &str,
    key: &str,
    proposal_id: &str,
    module_id: &str,
    parent: &str,
    tree: Value,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .post(format!("{}/rest/v1/proposal_lineage", url))
        .header("apikey", key)
        .header("Authorization", format!("Bearer {}", key))
        .header("Content-Type", "application/json")
        .json(&json!({
            "id": Uuid::new_v4().to_string(),
            "proposal_id": proposal_id,
            "module_id": module_id,
            "parent_module_id": parent,
            "lineage_tree": tree
        }))
        .send()
        .await?;
    Ok(())
}

async fn write_governance_event(
    client: &Client,
    url: &str,
    key: &str,
    proposal_id: &str,
    authority: &str,
    event: &str,
    details: Value,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .post(format!("{}/rest/v1/proposal_governance_events", url))
        .header("apikey", key)
        .header("Authorization", format!("Bearer {}", key))
        .header("Content-Type", "application/json")
        .json(&json!({
            "id": Uuid::new_v4().to_string(),
            "proposal_id": proposal_id,
            "authority": authority,
            "event_type": event,
            "details": details
        }))
        .send()
        .await?;
    Ok(())
}
