use tauri::{Manager, WebviewWindowBuilder};

pub fn get_window(
  app: &tauri::AppHandle,
  label: &str,
) -> tauri::Result<tauri::WebviewWindow> {
  let window = app.get_webview_window(label);
  if let Some(window) = window {
    Ok(window)
  } else {
    let config = app
      .config()
      .app
      .windows
      .iter()
      .find(|w| w.label == label);

    if let Some(config) = config {
      WebviewWindowBuilder::from_config(app, config)?.build()
    } else {
      Err(tauri::Error::WindowNotFound)
    }
  }
}
