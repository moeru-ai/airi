use tauri::{TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("airi")
        .title_bar_style(TitleBarStyle::Transparent)
        // .decorations(false)
        .inner_size(800.0, 600.0)
        .shadow(false)
        .transparent(true)
        .build()
        .unwrap();

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
