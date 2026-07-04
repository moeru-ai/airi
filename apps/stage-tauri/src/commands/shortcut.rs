// Global shortcut commands matching apps/stage-tamagotchi/src/shared/eventa contracts
// All commands use placeholder implementations

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
pub struct ShortcutRegistrationResult {
    pub id: String,
    pub success: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShortcutBinding {
    pub id: String,
    pub binding: String,
}

/// Register a global shortcut - placeholder
#[tauri::command]
pub async fn electron_shortcut_register(
    _binding: Option<Value>,
) -> ShortcutRegistrationResult {
    ShortcutRegistrationResult {
        id: "placeholder".to_string(),
        success: false,
    }
}

/// Unregister a global shortcut - placeholder
#[tauri::command]
pub async fn electron_shortcut_unregister(
    _id: Option<String>,
) -> Result<(), String> {
    Ok(())
}

/// Unregister all global shortcuts - placeholder
#[tauri::command]
pub async fn electron_shortcut_unregister_all() -> Result<(), String> {
    Ok(())
}

/// List registered shortcuts - placeholder
#[tauri::command]
pub async fn electron_shortcut_list() -> Vec<ShortcutBinding> {
    vec![]
}
