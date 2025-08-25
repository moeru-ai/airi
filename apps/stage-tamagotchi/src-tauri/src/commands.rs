use log::debug;
use tauri::Manager;

#[tauri::command]
pub async fn open_window(
  app: tauri::AppHandle,
  label: String,
) -> Result<(), tauri::Error> {
  let window = app.get_webview_window(&label);
  if let Some(window) = window {
    window.show()
  } else {
    Err(tauri::Error::WindowNotFound)
  }
}

#[tauri::command]
pub fn debug_println(msg: serde_json::Value) -> Result<(), tauri::Error> {
  debug!("{msg}");
  Ok(())
}
