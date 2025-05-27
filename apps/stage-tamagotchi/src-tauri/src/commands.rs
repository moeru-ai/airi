use tauri::Manager;

use crate::windows;

#[tauri::command]
pub async fn open_settings_window(app: tauri::AppHandle) -> Result<(), tauri::Error> {
  let window = app.get_webview_window("settings");
  if let Some(window) = window {
    let _ = window.show();
    return Ok(());
  }

  windows::settings::new_settings_window(&app)?;
  Ok(())
}

#[tauri::command]
pub async fn open_chat_window(app: tauri::AppHandle) -> Result<(), tauri::Error> {
  let window = app.get_webview_window("chat");
  if let Some(window) = window {
    let _ = window.show();
    return Ok(());
  }

  windows::chat::new_chat_window(&app)?;
  Ok(())
}
