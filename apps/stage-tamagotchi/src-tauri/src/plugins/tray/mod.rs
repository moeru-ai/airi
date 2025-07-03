use tauri::{
  Emitter,
  Manager,
  Runtime,
  menu::{Menu, MenuItem, Submenu},
  plugin::{Builder as PluginBuilder, TauriPlugin},
  tray::TrayIconBuilder,
};
use tauri_plugin_positioner::WindowExt;

use crate::app::windows::settings::new_settings_window;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  PluginBuilder::new("proj-airi-tauri-plugin-audio-vad")
    .setup(|app, _| {
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

      let menu = Menu::with_items(
        app,
        &[
          &settings_item,
          &position_sub_menu,
          &hide_item,
          &show_item,
          &quit_item,
        ],
      )?;

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

            new_settings_window(app).unwrap();
          }
          "center" => {
            let window = app.get_webview_window("main");
            if let Some(window) = window {
              let _ = window.move_window(tauri_plugin_positioner::Position::Center);
            }
          }
          "bottom-left" => {
            let window = app.get_webview_window("main");
            if let Some(window) = window {
              let _ = window.move_window(tauri_plugin_positioner::Position::BottomLeft);
            }
          }
          "bottom-right" => {
            let window = app.get_webview_window("main");
            if let Some(window) = window {
              let _ = window.move_window(tauri_plugin_positioner::Position::BottomRight);
            }
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
    .invoke_handler(tauri::generate_handler![])
    .build()
}
