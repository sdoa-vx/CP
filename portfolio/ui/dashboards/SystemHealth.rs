// SDOA v1.2 compliant — Native Shell Dashboard
// Last modified: 2026-07-13T00:00:00Z
use sdoa_sdk::prelude::*;
use tauri::Manager;

#[derive(SdoaDashboard)]
#[sdoa(
    id = "SystemHealth",
    r#type = "dashboard",
    layer = 3,
    runtime = "Rust/Tauri",
    version = "2.0.1",
    requires = ["ProvisioningService", "LlmPolicyEngine"],
    dependencies = ["ProvisioningService", "LlmPolicyEngine"],
    capabilities = ["dashboard:spawnWindow", "dashboard:systemHealth"],
    docs_description = "Native Tauri shell dashboard that spawns the system-health window and exposes bump_patch()-based native window management for the SDOA control surface.",
    docs_author = "ProtoAI Team",
    last_modified = "2026-07-13T00:00:00Z"
)]
pub struct SystemHealth;

impl SystemHealth {
    // This Rust method triggers the native Tauri window
    pub fn spawn_window(&self, app_handle: tauri::AppHandle) {
        let _window = tauri::WindowBuilder::new(
            &app_handle,
            "system_health",
            tauri::WindowUrl::App("health_view.html".into())
        )
        .title("SDOA System Control")
        .inner_size(1200.0, 800.0)
        .build()
        .unwrap();

        self.bump_patch("Migrated to native Tauri shell");
    }
}
