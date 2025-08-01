use log::debug;
use tauri::Manager;

use crate::app::windows::{chat, onboarding, settings};

#[tauri::command]
pub async fn open_settings_window(app: tauri::AppHandle) -> Result<(), tauri::Error> {
  let window = app.get_webview_window("settings");
  if let Some(window) = window {
    let _ = window.show();
    return Ok(());
  }

  settings::new_settings_window(&app, None)?;
  Ok(())
}

#[tauri::command]
pub async fn open_chat_window(app: tauri::AppHandle) -> Result<(), tauri::Error> {
  let window = app.get_webview_window("chat");
  if let Some(window) = window {
    let _ = window.show();
    return Ok(());
  }

  chat::new_chat_window(&app, None)?;
  Ok(())
}

#[tauri::command]
pub async fn open_onboarding_window(app: tauri::AppHandle) -> Result<(), tauri::Error> {
  let window = app.get_webview_window("onboarding");
  if let Some(window) = window {
    let _ = window.show();
    return Ok(());
  }

  onboarding::new_onboarding_window(&app, None)?;
  Ok(())
}

#[tauri::command]
pub fn debug_println(msg: serde_json::Value) -> Result<(), tauri::Error> {
  debug!("{msg}");
  Ok(())
}
