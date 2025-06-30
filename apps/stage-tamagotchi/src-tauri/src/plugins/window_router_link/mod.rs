use tauri::{
  Manager,
  Runtime,
  plugin::{Builder, TauriPlugin},
};

use crate::app::windows::{chat, settings};

#[tauri::command]
async fn go<R: Runtime>(
  window: tauri::Window<R>,
  route: String,
  window_label: String,
) -> std::result::Result<(), String> {
  let app = window.app_handle();

  let target_window = match window_label.as_str() {
    "chat" => match app.get_webview_window("chat") {
      Some(window) => window,
      None => {
        chat::new_chat_window(app).map_err(|e| format!("Failed to create chat window: {}", e))?
      },
    },
    "settings" => match app.get_webview_window("settings") {
      Some(window) => window,
      None => settings::new_settings_window(app)
        .map_err(|e| format!("Failed to create settings window: {}", e))?,
    },
    _ => {
      return Err(format!("Unknown window label: {}", window_label));
    },
  };

  let mut current_url = target_window
    .url()
    .map_err(|e| format!("Failed to get current URL: {}", e))?;
  let route: String = "/".to_string() + route.trim_start_matches('/');
  current_url.set_fragment(Some(route.to_string().as_str()));

  let _ = target_window.show();
  let _ = target_window.navigate(current_url);

  Ok(())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("proj-airi-tauri-plugin-window-router-link")
    .invoke_handler(tauri::generate_handler![go])
    .setup(|_, _| Ok(()))
    .build()
}
