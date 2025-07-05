#[cfg(debug_assertions)]
use specta_typescript::Typescript;
use tauri::{
  Manager,
  Runtime,
  plugin::{Builder, TauriPlugin},
};

use crate::app::windows::{chat, settings};

#[tauri::command]
#[specta::specta]
async fn go<R: Runtime>(
  window: tauri::Window<R>,
  route: String,
  // ↓ #[specta(optional)] is not available in parameters.
  // ↓ This will be `string | null` in the generated TypeScript code
  window_label: Option<String>,
) -> std::result::Result<(), String> {
  let app = window.app_handle();

  let target_window = match window_label.as_deref() {
    Some("chat") => match app.get_webview_window("chat") {
      Some(window) => window,
      None => {
        chat::new_chat_window(app).map_err(|e| format!("Failed to create chat window: {}", e))?
      },
    },
    Some("settings") => match app.get_webview_window("settings") {
      Some(window) => window,
      None => settings::new_settings_window(app)
        .map_err(|e| format!("Failed to create settings window: {}", e))?,
    },
    Some(label) => {
      return Err(format!("Unknown window label: {}", label));
    },
    None => {
      return Err("Missing window label".into());
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

const PLUGIN_NAME: &str = "proj-airi-tauri-plugin-window-router-link";

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  let builder = tauri_specta::Builder::<R>::new()
    .plugin_name(PLUGIN_NAME)
    .commands(tauri_specta::collect_commands![go::<tauri::Wry>]);

  #[cfg(debug_assertions)]
  builder
    .export(
      Typescript::default().header("// @ts-nocheck\n"),
      "../src/commands/bindings/window-router-link.ts",
    )
    .expect("Failed to export typescript bindings");

  Builder::new(PLUGIN_NAME)
    .invoke_handler(builder.invoke_handler())
    .setup(|_, _| Ok(()))
    .build()
}
