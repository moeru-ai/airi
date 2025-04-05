use tauri::{WebviewUrl, WebviewWindowBuilder, Manager};
use std::path::Path;

#[tauri::command]
pub fn open_settings_window(app: tauri::AppHandle) {
  if let Some(window) = app.get_webview_window("settings") {
    let _ = window.show();
    return;
  }

  let _ = WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App(Path::new("#/settings").to_path_buf()))
    .title("settings")
    .inner_size(600.0, 800.0)
    .build()
    .unwrap();
}
