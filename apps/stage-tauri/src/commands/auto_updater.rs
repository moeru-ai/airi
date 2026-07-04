// Auto-updater commands matching @proj-airi/tauri-eventa contracts
// All commands use placeholder implementations

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
pub struct AutoUpdaterState {
    pub status: String,
    pub info: Option<Value>,
    pub progress: Option<Value>,
    pub error: Option<Value>,
    pub diagnostics: Option<Value>,
}

impl Default for AutoUpdaterState {
    fn default() -> Self {
        Self {
            status: "not-available".to_string(),
            info: None,
            progress: None,
            error: None,
            diagnostics: None,
        }
    }
}

/// Get current auto-updater state
#[tauri::command]
pub async fn electron_auto_updater_get_state() -> AutoUpdaterState {
    AutoUpdaterState::default()
}

/// Check for updates - placeholder returns "not-available"
#[tauri::command]
pub async fn electron_auto_updater_check_for_updates() -> AutoUpdaterState {
    AutoUpdaterState {
        status: "not-available".to_string(),
        info: None,
        progress: None,
        error: None,
        diagnostics: None,
    }
}

/// Download update - placeholder
#[tauri::command]
pub async fn electron_auto_updater_download_update() -> AutoUpdaterState {
    AutoUpdaterState::default()
}

/// Quit and install - placeholder (exits app)
#[tauri::command]
pub async fn electron_auto_updater_quit_and_install() {
    // Placeholder: no-op for now
}

/// Auto-updater preferences get
#[tauri::command]
pub async fn electron_auto_updater_get_preferences() -> Value {
    serde_json::json!({})
}

/// Auto-updater preferences set
#[tauri::command]
pub async fn electron_auto_updater_set_preferences(
    _prefs: Option<Value>,
) -> Value {
    serde_json::json!({})
}
