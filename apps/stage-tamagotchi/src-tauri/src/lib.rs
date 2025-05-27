use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Emitter;
use tauri::RunEvent;

#[cfg(target_os = "macos")]
use tauri::{ActivationPolicy, TitleBarStyle};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_prevent_default::Flags;

mod commands;
mod windows;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let prevent_default_plugin = tauri_plugin_prevent_default::Builder::new()
    .with_flags(Flags::RELOAD)
    .build();

  tauri::Builder::default()
    .plugin(prevent_default_plugin)
    .plugin(tauri_plugin_mcp::Builder.build())
    .plugin(tauri_plugin_os::init())
    .setup(|app| {
      let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("AIRI")
        .decorations(false)
        .inner_size(450.0, 600.0)
        .shadow(false)
        .transparent(true)
        .always_on_top(true);

      #[cfg(target_os = "macos")]
      {
        builder = builder.title_bar_style(TitleBarStyle::Transparent);
      }

      let _ = builder.build().unwrap();

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
            tauri_plugin_mcp::destroy(app);
            let _ = app.emit("mcp_plugin_destroyed", ());
            app.cleanup_before_exit();
            app.exit(0);
          }
          "settings" => {
            let window = app.get_webview_window("settings");
            if let Some(window) = window {
              let _ = window.show();
              return;
            }

            windows::settings::new_settings_window(app).unwrap();
          }
          "hide" => {
            let window = app.get_webview_window("settings");
            if let Some(window) = window {
              let _ = window.hide();
            }
          }
          "show" => {
            let window = app.get_webview_window("settings");
            if let Some(window) = window {
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
    .invoke_handler(tauri::generate_handler![
      commands::open_settings_window,
      commands::open_chat_window,
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_, event| match event {
      RunEvent::ExitRequested { .. } => {
        println!("Exiting app");
        println!("Exited app");
      }
      _ => {}
    });
}
