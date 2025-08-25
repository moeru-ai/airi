use tauri::{
  Emitter,
  Manager,
  menu::{Menu, MenuItem, Submenu},
  tray::TrayIconBuilder,
};
use tauri_plugin_positioner::WindowExt;
use tauri_plugin_prevent_default::Flags;
use tauri_plugin_window_router_link::WindowMatcher;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

mod commands;

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
    // Project AIRI plugins
    .plugin(tauri_plugin_ipc_audio_transcription_ort::init())
    .plugin(tauri_plugin_ipc_audio_vad_ort::init())
    .plugin(tauri_plugin_window_pass_through_on_hover::init())
    .plugin(tauri_plugin_rdev::init())
    .plugin(tauri_plugin_window_router_link::init(
      WindowMatcher::new()
        .register("chat", |app, _| {
          Ok(app.get_webview_window("chat").unwrap())
        })
        .register("settings", |app, _| {
          Ok(app.get_webview_window("settings").unwrap())
        })
        .register("onboarding", |app, _| {
          Ok(app.get_webview_window("onboarding").unwrap())
        })
    ))
    .setup(|app| {
      // Main window is now created declaratively via tauri.conf.json
      let main_window = app.get_webview_window("main").unwrap();

      #[cfg(target_os = "macos")]
      {
        app.set_activation_policy(tauri::ActivationPolicy::Accessory); // hide dock icon
      }

      if cfg!(debug_assertions) {
        main_window.open_devtools();
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;

      let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
      let hide_item = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;

      let position_center_item = MenuItem::with_id(app, "center", "Center", true, None::<&str>)?;
      let position_bottom_left_item =
        MenuItem::with_id(app, "bottom-left", "Bottom Left", true, None::<&str>)?;
      let position_bottom_right_item =
        MenuItem::with_id(app, "bottom-right", "Bottom Right", true, None::<&str>)?;

      let position_sub_menu = Submenu::with_id_and_items(
        app,
        "position",
        "Position",
        true,
        &[
          &position_center_item,
          &position_bottom_left_item,
          &position_bottom_right_item,
        ],
      )?;

      let window_mode_fade_on_hover = MenuItem::with_id(app, "window-mode.fade-on-hover", "Fade On Hover", true, None::<&str>)?;
      let window_mode_move = MenuItem::with_id(app, "window-mode.move", "Move", true, None::<&str>)?;
      let window_mode_resize = MenuItem::with_id(app, "window-mode.resize", "Resize", true, None::<&str>)?;

      let window_mode_sub_menu = Submenu::with_id_and_items(
        app,
        "window-mode",
        "Window Mode",
        true,
        &[
          &window_mode_fade_on_hover,
          &window_mode_move,
          &window_mode_resize,
        ],
      )?;

      let menu = Menu::with_items(
        app,
        &[
          &settings_item,
          &window_mode_sub_menu,
          &position_sub_menu,
          &hide_item,
          &show_item,
          &quit_item,
        ],
      )?;

      if cfg!(debug_assertions) {
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
            // Settings window should exist as it's declared in tauri.conf.json
            eprintln!("Settings window not found!");
          }
          "window-mode.fade-on-hover" => {
            let window = app.get_webview_window("main");
            if let Some(window) = window {
              window.emit("tauri-main:main:window-mode:fade-on-hover", true).map_err(|_| ()).unwrap();
            }
          }
          "window-mode.move" => {
            let window = app.get_webview_window("main");
            if let Some(window) = window {
              window.emit("tauri-main:main:window-mode:move", true).map_err(|_| ()).unwrap();
            }
          }
          "window-mode.resize" => {
            let window = app.get_webview_window("main");
            if let Some(window) = window {
              window.emit("tauri-main:main:window-mode:resize", true).map_err(|_| ()).unwrap();
            }
          }
          "center" => {
            let _ = app.get_webview_window("main")
              .ok_or(())
              .and_then(|window| window.move_window(tauri_plugin_positioner::Position::Center)
              .map_err(|_| ()))
              .map(|_| app.save_window_state(StateFlags::POSITION));
          }
          "bottom-left" => {
            let _ = app.get_webview_window("main")
              .ok_or(())
              .and_then(|window| window.move_window(tauri_plugin_positioner::Position::BottomLeft)
              .map_err(|_| ()))
              .map(|_| app.save_window_state(StateFlags::POSITION));
          }
          "bottom-right" => {
            let _ = app.get_webview_window("main")
              .ok_or(())
              .and_then(|window| window.move_window(tauri_plugin_positioner::Position::BottomRight)
              .map_err(|_| ()))
              .map(|_| app.save_window_state(StateFlags::POSITION));
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
      commands::open_onboarding_window,
      commands::debug_println,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
