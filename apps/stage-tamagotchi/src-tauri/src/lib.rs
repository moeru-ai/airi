use log::info;
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
mod plugins;
mod whisper;

fn load_whisper_model(window: tauri::Window) -> anyhow::Result<()> {
  let device = whisper::model_manager::load_device()?;

  whisper::model_manager::load_whisper_model(window.clone(), device.clone())?;
  whisper::model_manager::load_vad_model(window.clone(), candle_core::Device::Cpu)?;

  Ok(())
}

#[tauri::command]
async fn load_models(window: tauri::Window) -> Result<(), String> {
  info!("Loading models...");

  load_whisper_model(window).map_or_else(
    |e| {
      let error_message = format!("Failed to load models: {}", e);
      info!("{}", error_message);
      Err(error_message)
    },
    |_| {
      info!("Models loaded successfully");
      Ok(())
    },
  )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(clippy::missing_panics_doc)]
pub fn run() {
  let prevent_default_plugin = tauri_plugin_prevent_default::Builder::new()
    .with_flags(Flags::RELOAD)
    .build();

  #[allow(clippy::missing_panics_doc)]
  tauri::Builder::default()
    .plugin(prevent_default_plugin)
    .plugin(tauri_plugin_mcp::Builder.build())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .plugin(tauri_plugin_positioner::init())
    .plugin(plugins::window::init())
    .plugin(plugins::window_persistence::init())
    .plugin(plugins::window_pass_through_on_hover::init())
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
      load_models,
      open_route_in_window,
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_, _| {});
}
