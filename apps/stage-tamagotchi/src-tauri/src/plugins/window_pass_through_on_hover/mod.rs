pub mod native_macos;
pub mod native_windows;
pub mod state;
pub mod types;

use std::{sync::atomic::Ordering, time::Duration};

#[cfg(target_os = "macos")]
use native_macos::{get_mouse_location, get_window_frame};
#[cfg(target_os = "windows")]
use native_windows::{get_mouse_location, get_window_frame};
#[cfg(debug_assertions)]
use specta_typescript::Typescript;
use state::{WindowClickThroughState, set_pass_through_enabled};
use tauri::{
  Emitter,
  Manager,
  Result,
  Runtime,
  plugin::{Builder as PluginBuilder, TauriPlugin},
};
use tokio::time::sleep;

#[tauri::command]
async fn start_monitor<R: Runtime>(window: tauri::Window<R>) -> Result<()> {
  let window = window;
  let state = window.state::<WindowClickThroughState>();
  let monitoring_enabled = state.monitoring_enabled.clone();

  // Already monitoring?
  if monitoring_enabled.load(Ordering::Relaxed) {
    return Ok(());
  }

  // Set to true
  state
    .monitoring_enabled
    .store(true, Ordering::Relaxed);

  // Then start interval timer for monitoring
  tauri::async_runtime::spawn(async move {
    loop {
      sleep(Duration::from_millis(32)).await; // ~30FPS check rate

      // If monitoring is already stopped, break the loop
      if !monitoring_enabled.load(Ordering::Relaxed) {
        break;
      }

      #[cfg(target_os = "macos")]
      {
        let _ = window.emit(
          "tauri-app:proj-airi:window-pass-through-on-hover:cursor-position",
          get_mouse_location(),
        );
        let _ = window.emit(
          "tauri-app:proj-airi:window-pass-through-on-hover:window-frame",
          get_window_frame(&window),
        );
      }

      #[cfg(target_os = "windows")]
      {
        let _ = window.emit(
          "tauri-app:proj-airi:window-pass-through-on-hover:cursor-position",
          get_mouse_location(),
        );
        let _ = window.emit(
          "tauri-app:proj-airi:window-pass-through-on-hover:window-frame",
          get_window_frame(&window),
        );
      }
    }
  });

  Ok(())
}

#[tauri::command]
async fn stop_monitor<R: Runtime>(window: tauri::Window<R>) -> Result<()> {
  let window = window;
  let state = window.state::<WindowClickThroughState>();

  // Set to false
  // Termination will be triggered in the next interval check (tick)
  state
    .monitoring_enabled
    .store(false, Ordering::Relaxed);

  Ok(())
}

#[tauri::command]
#[specta::specta]
async fn start_pass_through<R: Runtime>(
  window: tauri::Window<R>
) -> std::result::Result<(), String> {
  set_pass_through_enabled(&window, true).map_err(|e| {
    log::error!("Failed to enable click-through: {e}");
    e
  })
}

#[tauri::command]
#[specta::specta]
async fn stop_pass_through<R: Runtime>(
  window: tauri::Window<R>
) -> std::result::Result<(), String> {
  set_pass_through_enabled(&window, false).map_err(|e| {
    log::error!("Failed to disable click-through: {e}");
    e
  })
}

const PLUGIN_NAME: &str = "proj-airi-tauri-plugin-window-pass-through-on-hover";

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  let builder = tauri_specta::Builder::<R>::new()
    .plugin_name(PLUGIN_NAME)
    // ↓ HACKY WARNING
    // ↓ Below is a modified version from the expansion of `tauri_specta::collect_commands!`,
    // ↓ as the original macro does not accept a mix of commands with and without `#[specta::specta]`
    .commands(tauri_specta::internal::command(
      tauri::generate_handler![
        start_monitor,
        stop_monitor,
        start_pass_through,
        stop_pass_through
      ],
      specta::function::collect_functions![
        start_pass_through::<tauri::Wry>,
        //                   ^^^^^^^^^^
        // We have to specify the runtime type here. This is a known issue:
        // - https://github.com/specta-rs/tauri-specta/issues/70
        // - https://github.com/specta-rs/tauri-specta/issues/162
        stop_pass_through::<tauri::Wry>,
      ]
    ));

  #[cfg(debug_assertions)]
  builder
    .export(
      Typescript::default(),
      "../src/commands/bindings/window-pass-through-on-hover.ts",
    )
    .expect("Failed to export typescript bindings");

  PluginBuilder::new(PLUGIN_NAME)
    .setup(|app, _| {
      app.manage(WindowClickThroughState::default());
      Ok(())
    })
    .invoke_handler(builder.invoke_handler())
    .build()
}
