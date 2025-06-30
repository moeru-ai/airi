use log::info;
use tauri::{
  Emitter,
  Manager,
  RunEvent,
  WebviewUrl,
  WebviewWindowBuilder,
  menu::{Menu, MenuItem},
  tray::TrayIconBuilder,
};
use tauri_plugin_prevent_default::Flags;
use tauri_plugin_window_state::{AppHandleExt, WindowExt};

mod app_windows;
mod commands;
mod plugins;
mod whisper;

#[tauri::command]
async fn load_models(window: tauri::Window) -> Result<(), String> {
  let device = whisper::model_manager::load_device().unwrap();

  // whisper::model_manager::load_whisper_model(window.clone(), device.clone()).unwrap();
  // whisper::model_manager::load_vad_model(window.clone(), candle_core::Device::Cpu).unwrap();

  Ok(())
}

#[tauri::command]
async fn open_route_in_window(
  window: tauri::Window,
  route: String,
  window_label: String,
) -> Result<(), String> {
  let app = window.app_handle();

  let target_window = match window_label.as_str() {
    "chat" => match app.get_webview_window("chat") {
      Some(window) => window,
      None => app_windows::chat::new_chat_window(app)
        .map_err(|e| format!("Failed to create chat window: {}", e))?,
    },
    "settings" => match app.get_webview_window("settings") {
      Some(window) => window,
      None => app_windows::settings::new_settings_window(app)
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
    // .plugin(plugins::window_persistence::init())
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

      let window = builder.build().unwrap();

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

      window
        .restore_state(tauri_plugin_window_state::StateFlags::all())
        .map_err(|e| format!("Failed to restore window state: {}", e))
        .unwrap_or_else(|err| {
          info!("Failed to restore window state: {}", err);
        });

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

            app_windows::settings::new_settings_window(app).unwrap();
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
      commands::open_settings_window,
      commands::open_chat_window,
      commands::debug_println,
      load_models,
      open_route_in_window,
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| match event {
      RunEvent::Exit { .. } => {
        info!("Exiting app");
        info!("Exited app");

        // Save window state on exit
        app
          .save_window_state(tauri_plugin_window_state::StateFlags::all())
          .map_err(|e| format!("Failed to save window state: {}", e))
          .unwrap_or_else(|err| {
            info!("Failed to save window state on exit: {}", err);
          });
      },
      RunEvent::ExitRequested { .. } => {
        info!("Requested Exiting app");
        info!("Requested Exited app");

        app
          .save_window_state(tauri_plugin_window_state::StateFlags::all())
          .map_err(|e| format!("Failed to save window state: {}", e))
          .unwrap_or_else(|err| {
            info!("Failed to save window state on exit: {}", err);
          });
      },
      _ => {},
    })
}
