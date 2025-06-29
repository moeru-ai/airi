use log::info;
use tauri::Window;
use tauri_plugin_window_state::{AppHandleExt, WindowExt};

#[tauri::command]
pub async fn plugins_window_persistence_save(app: tauri::AppHandle) -> Result<(), String> {
  info!("Saving window state...");
  app
    .save_window_state(tauri_plugin_window_state::StateFlags::all())
    .map_err(|e| format!("Failed to save window state: {}", e))
}

#[tauri::command]
pub async fn plugins_window_persistence_restore(window: Window) -> Result<(), String> {
  info!("Restoring window state...");
  // The window state is automatically restored when the plugin is initialized
  // This command can be used to manually trigger a restore
  window
    .restore_state(tauri_plugin_window_state::StateFlags::all())
    .map_err(|e| format!("Failed to restore window state: {}", e))
}
