// Widget window commands matching apps/stage-tamagotchi/src/shared/eventa contracts
// All commands use placeholder implementations

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
pub struct WidgetSnapshot {
    pub id: String,
    pub component_name: String,
    pub component_props: Value,
    pub size: Value,
    pub window_size: Option<Value>,
    pub ttl_ms: i64,
}

/// Open widgets window - placeholder
#[tauri::command]
pub async fn electron_windows_widgets_open(
    _id: Option<String>,
) -> Result<(), String> {
    Ok(())
}

/// Hide widgets window - placeholder
#[tauri::command]
pub async fn electron_windows_widgets_hide(
    _id: Option<String>,
) -> Result<(), String> {
    Ok(())
}

/// Add widget - placeholder
#[tauri::command]
pub async fn electron_windows_widgets_add(
    _payload: Option<Value>,
) -> Result<Option<String>, String> {
    Ok(Some("placeholder-widget-id".to_string()))
}

/// Remove widget - placeholder
#[tauri::command]
pub async fn electron_windows_widgets_remove(
    _id: Option<String>,
) -> Result<(), String> {
    Ok(())
}

/// Clear all widgets - placeholder
#[tauri::command]
pub async fn electron_windows_widgets_clear() -> Result<(), String> {
    Ok(())
}

/// Update widget - placeholder
#[tauri::command]
pub async fn electron_windows_widgets_update(
    _payload: Option<Value>,
) -> Result<(), String> {
    Ok(())
}

/// Fetch widget by id - placeholder
#[tauri::command]
pub async fn electron_windows_widgets_fetch(
    _id: Option<String>,
) -> Result<Option<WidgetSnapshot>, String> {
    Ok(None)
}

/// Prepare widget window - placeholder
#[tauri::command]
pub async fn electron_windows_widgets_prepare(
    _id: Option<String>,
) -> Result<Option<String>, String> {
    Ok(None)
}

/// Publish iframe event - placeholder
#[tauri::command]
pub async fn electron_windows_widgets_iframe_publish(
    _id: Option<String>,
    _event: Option<Value>,
) -> Result<(), String> {
    Ok(())
}
