// Window management commands matching apps/stage-tamagotchi/src/shared/eventa contracts
// All commands use placeholder implementations

use crate::window_manager::{
    open_managed_window, stable_child_label, OpenManagedWindowOptions, OpenedManagedWindow,
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, WebviewWindow};

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

fn open_window_by_label(
    app: &AppHandle,
    label: &str,
    route: Option<String>,
) -> Result<OpenedManagedWindow, String> {
    open_managed_window(
        app,
        OpenManagedWindowOptions {
            label: label.to_string(),
            route,
            ..Default::default()
        },
    )
}

/// Open a managed Tauri window by label. This is a Tauri-only validation
/// command for windows that Electron opens via tray/startup instead of a
/// renderer Eventa invoke.
#[tauri::command]
pub async fn stage_tauri_managed_window_open(
    app: AppHandle,
    label: String,
    route: Option<String>,
) -> Result<OpenedManagedWindow, String> {
    open_window_by_label(&app, &label, route)
}

/// Open main window devtools.
#[tauri::command]
pub async fn electron_windows_main_devtools_open(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window.open_devtools();
    Ok(())
}

/// Open settings window.
#[tauri::command]
pub async fn electron_windows_settings_open(
    app: AppHandle,
    route: Option<String>,
) -> Result<(), String> {
    open_window_by_label(&app, "settings", route)?;
    Ok(())
}

/// Open chat window.
#[tauri::command]
pub async fn electron_windows_chat_open(app: AppHandle) -> Result<(), String> {
    open_window_by_label(&app, "chat", None)?;
    Ok(())
}

/// Open settings devtools.
#[tauri::command]
pub async fn electron_windows_settings_devtools_open(app: AppHandle) -> Result<(), String> {
    open_window_by_label(&app, "settings", None)?;
    if let Some(window) = app.get_webview_window("settings") {
        window.open_devtools();
    }
    Ok(())
}

/// Open devtools window.
#[tauri::command]
pub async fn electron_windows_devtools_open(
    app: AppHandle,
    key: Option<String>,
    route: Option<String>,
    width: Option<f64>,
    height: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
) -> Result<(), String> {
    let key = key.unwrap_or_else(|| "default".to_string());
    open_managed_window(
        &app,
        OpenManagedWindowOptions {
            label: "devtools".to_string(),
            route,
            window_label: Some(stable_child_label("devtools", &key)),
            width,
            height,
            x,
            y,
        },
    )?;
    Ok(())
}

/// Open onboarding window.
#[tauri::command]
pub async fn electron_windows_onboarding_open(app: AppHandle) -> Result<(), String> {
    open_window_by_label(&app, "onboarding", None)?;
    Ok(())
}

/// Close onboarding window.
#[tauri::command]
pub async fn electron_windows_onboarding_close(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("onboarding") {
        window.close().map_err(|e| e.to_string())?;
    }
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
