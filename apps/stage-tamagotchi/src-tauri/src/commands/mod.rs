use log::debug;
use tauri::Manager;

#[tauri::command]
pub async fn open_settings_window(app: tauri::AppHandle) -> Result<(), tauri::Error> {
  let window = app.get_webview_window("settings");
  if let Some(window) = window {
    let _ = window.show();
    return Ok(());
  }

  // Settings window should exist as it's declared in tauri.conf.json
  eprintln!("Settings window not found!");
  Ok(())
}

#[tauri::command]
pub async fn open_chat_window(app: tauri::AppHandle) -> Result<(), tauri::Error> {
  let window = app.get_webview_window("chat");
  if let Some(window) = window {
    let _ = window.show();
    return Ok(());
  }

  // Chat window should exist as it's declared in tauri.conf.json
  eprintln!("Chat window not found!");
  Ok(())
}

#[tauri::command]
pub async fn open_onboarding_window(app: tauri::AppHandle) -> Result<(), tauri::Error> {
  let window = app.get_webview_window("onboarding");
  if let Some(window) = window {
    let _ = window.show();
    return Ok(());
  }

  // Onboarding window should exist as it's declared in tauri.conf.json
  eprintln!("Onboarding window not found!");
  Ok(())
}

#[tauri::command]
pub fn debug_println(msg: serde_json::Value) -> Result<(), tauri::Error> {
  debug!("{msg}");
  Ok(())
}
