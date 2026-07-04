// Window management commands matching apps/stage-tamagotchi/src/shared/eventa contracts
// All commands use placeholder implementations

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::WebviewWindow;

// Lifecycle events

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowLifecycleState {
    pub focused: bool,
    pub minimized: bool,
    pub reason: String,
    pub updated_at: u64,
    pub visible: bool,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub(crate) fn get_window_lifecycle_state(
    window: &WebviewWindow,
    reason: &str,
) -> Result<WindowLifecycleState, String> {
    Ok(WindowLifecycleState {
        focused: window.is_focused().map_err(|e| e.to_string())?,
        minimized: window.is_minimized().map_err(|e| e.to_string())?,
        reason: reason.to_string(),
        updated_at: now_ms(),
        visible: window.is_visible().map_err(|e| e.to_string())?,
    })
}

/// Get current window lifecycle state
#[tauri::command]
pub async fn electron_window_get_lifecycle_state(
    window: WebviewWindow,
) -> Result<WindowLifecycleState, String> {
    get_window_lifecycle_state(&window, "snapshot")
}

// Window open/close commands

/// Open main window devtools - placeholder
#[tauri::command]
pub async fn electron_windows_main_devtools_open() -> Result<(), String> {
    Ok(())
}

/// Open settings window - placeholder
#[tauri::command]
pub async fn electron_windows_settings_open(
    _route: Option<String>,
) -> Result<(), String> {
    Ok(())
}

/// Open chat window - placeholder
#[tauri::command]
pub async fn electron_windows_chat_open() -> Result<(), String> {
    Ok(())
}

/// Open settings devtools - placeholder
#[tauri::command]
pub async fn electron_windows_settings_devtools_open() -> Result<(), String> {
    Ok(())
}

/// Open devtools window - placeholder
#[tauri::command]
pub async fn electron_windows_devtools_open(
    _key: Option<String>,
    _route: Option<String>,
    _width: Option<i32>,
    _height: Option<i32>,
    _x: Option<i32>,
    _y: Option<i32>,
) -> Result<(), String> {
    Ok(())
}

/// Open onboarding window - placeholder
#[tauri::command]
pub async fn electron_windows_onboarding_open() -> Result<(), String> {
    Ok(())
}

/// Close onboarding window - placeholder
#[tauri::command]
pub async fn electron_windows_onboarding_close() -> Result<(), String> {
    Ok(())
}

// Caption overlay commands

/// Get whether caption is following main window - placeholder
#[tauri::command]
pub async fn electron_windows_caption_overlay_get_is_following_window() -> bool {
    false
}

// Desktop overlay

/// Get desktop overlay readiness - placeholder
#[tauri::command]
pub async fn electron_windows_desktop_overlay_get_readiness() -> Value {
    serde_json::json!({ "state": "ready" })
}
