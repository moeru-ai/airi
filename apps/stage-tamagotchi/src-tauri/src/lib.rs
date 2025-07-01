use tauri::{
  Emitter,
  Manager,
  WebviewUrl,
  WebviewWindowBuilder,
  menu::{Menu, MenuItem},
  tray::TrayIconBuilder,
};
use tauri_plugin_prevent_default::Flags;

mod app;
mod helpers;
mod plugins;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let prevent_default_plugin = tauri_plugin_prevent_default::Builder::new()
    .with_flags(Flags::RELOAD)
    .build();

  tauri::Builder::default()
    // External plugins
    .plugin(prevent_default_plugin)
    .plugin(tauri_plugin_mcp::Builder.build())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .plugin(tauri_plugin_positioner::init())
    // Internal plugins
    .plugin(plugins::window::init())
    .plugin(plugins::window_persistence::init())
    .plugin(plugins::window_pass_through_on_hover::init())
    .plugin(plugins::window_router_link::init())
    .plugin(plugins::audio_transcription::init())
    .plugin(plugins::audio_vad::init())
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
        builder = builder.title_bar_style(tauri::TitleBarStyle::Transparent);
      }

      let _ = builder.build().unwrap();

      #[cfg(target_os = "macos")]
      {
        app.set_activation_policy(tauri::ActivationPolicy::Accessory); // hide dock icon
      }

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

      #[cfg(debug_assertions)]
      {
        let show_devtools_item =
          MenuItem::with_id(app, "show-devtools", "Show Devtools", true, None::<&str>)?;
        menu.append_items(&[&show_devtools_item])?;
      }

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

            app::windows::settings::new_settings_window(app).unwrap();
          }
          "hide" => {
            let window = app.get_webview_window("main");
            if let Some(window) = window {
              let _ = window.hide();
            }
          }
          "show" => {
            let window = app.get_webview_window("main");
            if let Some(window) = window {
              let _ = window.show();
            }
          }
          #[cfg(debug_assertions)]
          "show-devtools" => {
            let window = app.get_webview_window("main");
            if let Some(window) = window {
              window.open_devtools();
            }
          },
          _ => {}
        })
        .show_menu_on_left_click(true)
        .build(app)
        .unwrap();

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      app::commands::open_settings_window,
      app::commands::open_chat_window,
      app::commands::debug_println,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
