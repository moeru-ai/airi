use std::path::Path;

#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;
use tauri::{WebviewUrl, WebviewWindowBuilder};

pub fn new_settings_window(app: &tauri::AppHandle) -> Result<(), tauri::Error> {
  let mut builder = WebviewWindowBuilder::new(
    app,
    "settings",
    WebviewUrl::App(Path::new("#/settings").to_path_buf()),
  )
  .title("Settings")
  .inner_size(450.0, 800.0)
  .shadow(true)
  .transparent(false)
  .accept_first_mouse(true);

  #[cfg(target_os = "macos")]
  {
    // macOS traffic light (red, yellow, green) position customization
    //
    // feat: traffic light position (#12366) · tauri-apps/tauri@30f5a15
    // https://github.com/tauri-apps/tauri/commit/30f5a1553d3c0ce460c9006764200a9210915a44
    builder = builder.hidden_title(true);
    builder = builder.decorations(true);
    builder = builder.title_bar_style(TitleBarStyle::Overlay);
    builder = builder.traffic_light_position(tauri::LogicalPosition::new(14.0, 20.0));
  }

  builder.build()?;
  Ok(())
}
