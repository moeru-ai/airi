use log::info;
use tauri::{
  Manager,
  Result,
  Runtime,
  Window,
  plugin::{Builder, TauriPlugin},
};
use tauri_plugin_window_state::{AppHandleExt, WindowExt};

#[tauri::command]
pub async fn save<R: Runtime>(window: Window<R>) -> Result<()> {
  info!("Saving window state...");

  window
    .app_handle()
    .save_window_state(tauri_plugin_window_state::StateFlags::all())
    .map_err(|e| format!("Failed to save window state: {}", e))
    .unwrap_or_else(|err| {
      info!("Failed to restore window state: {}", err);
    });

  Ok(())
}

#[tauri::command]
pub async fn restore<R: Runtime>(window: Window<R>) -> Result<()> {
  info!("Restoring window state...");

  window
    .restore_state(tauri_plugin_window_state::StateFlags::all())
    .map_err(|e| format!("Failed to restore window state: {}", e))
    .unwrap_or_else(|err| {
      info!("Failed to restore window state: {}", err);
    });

  Ok(())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("proj-airi-tauri-plugin-window-persistence")
    .invoke_handler(tauri::generate_handler![save, restore,])
    .build()
}
