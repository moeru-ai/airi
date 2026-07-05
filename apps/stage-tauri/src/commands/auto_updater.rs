// Auto-updater commands matching @proj-airi/tauri-eventa contracts.

use serde::{Deserialize, Serialize};
use serde_json::Value;

const NO_UPDATE_STATUS: &str = "not-available";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoUpdaterState {
    pub current_version: String,
    pub is_update_available: bool,
    pub status: String,
    pub info: Option<Value>,
    pub progress: Option<Value>,
    pub error: Option<Value>,
    pub diagnostics: Option<Value>,
}

impl Default for AutoUpdaterState {
    fn default() -> Self {
        AutoUpdaterState::no_feed(false)
    }
}

impl AutoUpdaterState {
    fn no_feed(include_info: bool) -> Self {
        let current_version = env!("CARGO_PKG_VERSION").to_string();
        Self {
            current_version: current_version.clone(),
            is_update_available: false,
            status: NO_UPDATE_STATUS.to_string(),
            info: include_info.then(|| {
                serde_json::json!({
                    "version": current_version,
                    "isUpdateAvailable": false,
                })
            }),
            progress: None,
            error: None,
            diagnostics: None,
        }
    }
}

pub(crate) fn current_state() -> AutoUpdaterState {
    AutoUpdaterState::no_feed(false)
}

/// Get current auto-updater state
#[tauri::command]
pub async fn electron_auto_updater_get_state() -> AutoUpdaterState {
    current_state()
}

/// Check for updates. Without a configured feed, report a stable no-updates state.
#[tauri::command]
pub async fn electron_auto_updater_check_for_updates() -> AutoUpdaterState {
    AutoUpdaterState::no_feed(true)
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
pub async fn electron_auto_updater_set_preferences(_prefs: Option<Value>) -> Value {
    serde_json::json!({})
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn get_state_reports_current_version_and_no_available_update() {
        let state = electron_auto_updater_get_state().await;

        assert_eq!(state.current_version, env!("CARGO_PKG_VERSION"));
        assert_eq!(state.status, "not-available");
        assert!(!state.is_update_available);
    }

    #[tokio::test]
    async fn check_for_updates_returns_no_updates_when_no_feed_is_configured() {
        let state = electron_auto_updater_check_for_updates().await;

        assert_eq!(state.current_version, env!("CARGO_PKG_VERSION"));
        assert_eq!(state.status, "not-available");
        assert!(!state.is_update_available);
        assert_eq!(
            state.info,
            Some(serde_json::json!({
                "version": env!("CARGO_PKG_VERSION"),
                "isUpdateAvailable": false,
            }))
        );
    }
}
