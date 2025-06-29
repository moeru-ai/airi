use log::info;
use tauri::Window;
use tauri_plugin_window_state::{AppHandleExt, WindowExt};

#[tauri::command]
pub async fn plugins_window_persistence_save(app: tauri::AppHandle) -> Result<(), String> {
  info!("Saving window state...");

  app
    .save_window_state(tauri_plugin_window_state::StateFlags::all())
    .map_err(|e| format!("Failed to save window state: {}", e))
    .unwrap_or_else(|err| {
      info!("Failed to restore window state: {}", err);
    });

  Ok(())
}

#[tauri::command]
pub async fn plugins_window_persistence_restore(window: Window) -> Result<(), String> {
  info!("Restoring window state...");

  window
    .restore_state(tauri_plugin_window_state::StateFlags::all())
    .map_err(|e| format!("Failed to restore window state: {}", e))
    .unwrap_or_else(|err| {
      info!("Failed to restore window state: {}", err);
    });

  Ok(())
}
