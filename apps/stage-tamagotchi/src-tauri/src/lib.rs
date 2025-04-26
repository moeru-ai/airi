use tauri::{WebviewUrl, WebviewWindowBuilder, Manager};
#[cfg(target_os = "macos")]
use tauri::{ActivationPolicy,TitleBarStyle};
use tauri::tray::TrayIconBuilder;
use tauri::menu::{Menu, MenuItem};
use std::path::Path;
use tokio::sync::Mutex;

mod commands;
mod plugins;

use plugins::mcp::lib::McpState;
use plugins::mcp::commands::{connect_server, list_tools, call_tool};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(Mutex::new(McpState { client: None }))
    .plugin(tauri_plugin_os::init())
    .setup(|app| {
      let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("airi")
        .decorations(false)
        .inner_size(450.0, 600.0)
        .shadow(false)
        .transparent(true)
        .always_on_top(true);

      #[cfg(target_os = "macos")]
      {
        builder = builder.title_bar_style(TitleBarStyle::Transparent);
      }

      let _ = builder
        .build()
        .unwrap();

      #[cfg(target_os = "macos")]
      app.set_activation_policy(ActivationPolicy::Accessory); // hide dock icon

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // TODO: i18n
      let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
      let hide_item = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
      let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&settings_item, &hide_item, &show_item, &quit_item])?;

      let _ = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone()) // TODO: use custom icon
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
          "quit" => {
            app.exit(0);
          }
          "settings" => {
            if let Some(window) = app.get_webview_window("settings") {
              let _ = window.show();
              return;
            }

            let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App(Path::new("#/settings").to_path_buf()))
              .title("settings")
              .inner_size(600.0, 800.0)
              .build()
              .unwrap();
          }
          "hide" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.hide();
            }
          }
          "show" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.show();
            }
          }
          _ => {}
        })
        .show_menu_on_left_click(true)
        .build(app)
        .unwrap();

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![commands::open_settings_window, connect_server, list_tools, call_tool])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
