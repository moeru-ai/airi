use tauri::{
  AppHandle,
  Emitter,
  Manager,
  menu::{Menu, MenuEvent, MenuItem, Submenu},
  tray::TrayIconBuilder,
};
use tauri_plugin_positioner::WindowExt;
use tauri_plugin_prevent_default::Flags;
use tauri_plugin_window_router_link::WindowMatcher;

mod commands;

fn create_tray_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
  let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
  let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
  let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
  let hide_item = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;

  let position_center_item =
    MenuItem::with_id(app, "position.center", "Center", true, None::<&str>)?;
  let position_bottom_left_item = MenuItem::with_id(
    app,
    "position.bottom-left",
    "Bottom Left",
    true,
    None::<&str>,
  )?;
  let position_bottom_right_item = MenuItem::with_id(
    app,
    "position.bottom-right",
    "Bottom Right",
    true,
    None::<&str>,
  )?;

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

  let window_mode_fade_on_hover = MenuItem::with_id(
    app,
    "window-mode.fade-on-hover",
    "Fade On Hover",
    true,
    None::<&str>,
  )?;
  let window_mode_move = MenuItem::with_id(app, "window-mode.move", "Move", true, None::<&str>)?;
  let window_mode_resize =
    MenuItem::with_id(app, "window-mode.resize", "Resize", true, None::<&str>)?;

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

  Ok(menu)
}

fn on_menu_event(
  app: &AppHandle,
  event: MenuEvent,
) {
  match event.id().as_ref() {
    "quit" => {
      tauri_plugin_mcp::destroy(app);
      app.emit("mcp_plugin_destroyed", ()).unwrap();
      app.cleanup_before_exit();
      app.exit(0);
    },

    "settings" => {
      app
        .get_webview_window("settings")
        .unwrap()
        .show()
        .unwrap();
    },

    id if id.starts_with("window-mode.") => {
      let event = match id {
        "window-mode.fade-on-hover" => "tauri-main:main:window-mode:fade-on-hover",
        "window-mode.move" => "tauri-main:main:window-mode:move",
        "window-mode.resize" => "tauri-main:main:window-mode:resize",
        _ => unreachable!(),
      };
      app
        .get_webview_window("main")
        .unwrap()
        .emit(event, true)
        .unwrap();
    },

    id if id.starts_with("position.") => {
      let pos = match id {
        "position.center" => tauri_plugin_positioner::Position::Center,
        "position.bottom-left" => tauri_plugin_positioner::Position::BottomLeft,
        "position.bottom-right" => tauri_plugin_positioner::Position::BottomRight,
        _ => unreachable!(),
      };
      app
        .get_webview_window("main")
        .unwrap()
        .move_window(pos)
        .unwrap();
    },

    "hide" => {
      app
        .get_webview_window("main")
        .unwrap()
        .hide()
        .unwrap();
    },
    "show" => {
      app
        .get_webview_window("main")
        .unwrap()
        .show()
        .unwrap();
    },

    #[cfg(debug_assertions)]
    "show-devtools" => {
      app
        .get_webview_window("main")
        .unwrap()
        .open_devtools();
    },
    _ => {},
  }
}

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

      #[cfg(debug_assertions)]
      {
        main_window.open_devtools();
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let menu = create_tray_menu(&app.handle())?;

      TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone()) // TODO: use custom icon
        .menu(&menu)
        .on_menu_event(on_menu_event)
        .show_menu_on_left_click(true)
        .build(app)
        .unwrap();

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::open_window,
      commands::debug_println,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
