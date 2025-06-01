use std::{sync::atomic::Ordering, time::Duration};

use tauri::{
  menu::{Menu, MenuItem},
  tray::TrayIconBuilder,
  Emitter,
  Manager,
  RunEvent,
  WebviewUrl,
  WebviewWindowBuilder,
};
use tauri_plugin_prevent_default::Flags;
use tokio::time::sleep;

mod app_click_through;
mod app_windows;
mod commands;

#[cfg(target_os = "macos")]
use app_click_through::native_macos::is_cursor_in_window;
#[cfg(target_os = "windows")]
use app_click_through::native_windows::is_cursor_in_window;
use app_click_through::state::{set_click_through_enabled, set_cursor_inside, WindowClickThroughState};

#[tauri::command]
async fn start_monitor_for_clicking_through(window: tauri::Window) -> Result<(), String> {
  let window = window;
  let state = window.state::<WindowClickThroughState>();
  let enabled = state.enabled.clone();
  let monitoring_enabled = state.monitoring_enabled.clone();

  // Already monitoring?
  if monitoring_enabled.load(Ordering::Relaxed) {
    return Ok(());
  }

  // Set to true
  state.monitoring_enabled.store(true, Ordering::Relaxed);

  // Then start interval timer for monitoring
  tauri::async_runtime::spawn(async move {
    loop {
      sleep(Duration::from_millis(32)).await; // ~30FPS check rate

      // If monitoring is already stopped, break the loop
      if !monitoring_enabled.load(Ordering::Relaxed) {
        break;
      }

      // If is disabled already, skip until next check
      if !enabled.load(Ordering::Relaxed) {
        continue;
      }

      #[cfg(target_os = "macos")]
      {
        let cursor_inside = is_cursor_in_window(&window).await;

        // Only allow disabling click-through when:
        // 1. Cursor is OUTSIDE the window AND
        // 2. Modifier key is pressed
        let _ = set_cursor_inside(&window, cursor_inside);
      }

      #[cfg(target_os = "windows")]
      {
        let cursor_inside = is_cursor_in_window(&window).await;

        // Only allow disabling click-through when:
        // 1. Cursor is OUTSIDE the window AND
        // 2. Modifier key is pressed
        let _ = set_cursor_inside(&window, cursor_inside);
      }
    }
  });

  Ok(())
}

#[tauri::command]
async fn stop_monitor_for_clicking_through(window: tauri::Window) -> Result<(), String> {
  let window = window;
  let state = window.state::<WindowClickThroughState>();

  // Set to false
  // Termination will be triggered in the next interval check (tick)
  state.monitoring_enabled.store(false, Ordering::Relaxed);

  Ok(())
}

#[tauri::command]
async fn start_click_through(window: tauri::Window) -> Result<(), String> {
  set_click_through_enabled(&window, true)?;
  Ok(())
}

#[tauri::command]
async fn stop_click_through(window: tauri::Window) -> Result<(), String> {
  set_click_through_enabled(&window, false)?;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(clippy::missing_panics_doc)]
pub fn run() {
  let prevent_default_plugin = tauri_plugin_prevent_default::Builder::new().with_flags(Flags::RELOAD).build();

  #[allow(clippy::missing_panics_doc)]
  tauri::Builder::default()
    .plugin(prevent_default_plugin)
    .plugin(tauri_plugin_mcp::Builder.build())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .manage(WindowClickThroughState::default())
    .setup(|app| {
      let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default());

      builder = builder.title("AIRI").decorations(false).inner_size(450.0, 600.0).shadow(false).transparent(true).always_on_top(true);

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
        app.handle().plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())?;
      }

      // TODO: i18n
      let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
      let hide_item = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
      let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
      let show_devtools_item = MenuItem::with_id(app, "show-devtools", "Show Devtools", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&settings_item, &hide_item, &show_item, &show_devtools_item, &quit_item])?;

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
          "show-devtools" => {
            let window = app.get_webview_window("main");
            if let Some(window) = window {
              let _ = window.open_devtools();
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
      start_monitor_for_clicking_through,
      stop_monitor_for_clicking_through,
      start_click_through,
      stop_click_through,
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_, event| {
      if let RunEvent::ExitRequested { .. } = event {
        println!("Exiting app");
        println!("Exited app");
      }
    });
}
