// ──────────────────────────────────────────────────────────────────
// File:    CommandPalette.rs
// Version: 1.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// SDOA v1.2 compliant — Native System Engine
use sdoa_sdk::prelude::*;
use tauri::{GlobalShortcutManager, Manager};

#[derive(SdoaEngine)]
#[sdoa(
    id = "CommandPalette.engine",
    type = "engine",
    layer = 3,
    runtime = "Rust",
    version = "1.0.1",
    capabilities = ["hotkey.register", "palette.toggle"],
    dependencies = ["QmdAdapter", "LlmBridge"],
    docs_description = "Registers the global Cmd+Shift+Space hotkey and toggles visibility of the native Tauri command palette window.",
    docs_author = "ProtoAI Team",
    last_modified = "2026-07-13T00:00:00Z"
)]
pub struct CommandPalette;

impl CommandPalette {
    pub fn setup_hotkeys(&self, app: &mut tauri::App) {
        let mut shortcuts = app.global_shortcut_manager();
        let handle = app.handle();

        // Register Cmd+Shift+Space as the universal SDOA entry point
        shortcuts.register("CmdOrCtrl+Shift+Space", move || {
            let window = handle.get_window("palette").unwrap();
            if window.is_visible().unwrap() {
                window.hide().unwrap();
            } else {
                window.show().unwrap();
                window.set_focus().unwrap();
            }
        }).unwrap();

        self.bump_patch("Global hotkey registered.");
    }
}
