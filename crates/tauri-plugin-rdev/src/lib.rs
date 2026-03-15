use std::sync::{atomic::Ordering, Mutex};

use log::error;
use rdev::{listen, Event, EventType};
use serde::Serialize;
use serde_json::Value;
use tauri::{
  plugin::{Builder as PluginBuilder, TauriPlugin},
  Emitter, Manager, Runtime,
};

#[derive(Debug, Clone, Serialize)]
pub enum DeviceKind {
  MousePress,
  MouseRelease,
  MouseMove,
  KeyboardPress,
  KeyboardRelease,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeviceEvent {
  kind: DeviceKind,
  value: Value,
}

#[derive(Default)]
struct PluginState {
  window_labels: Vec<String>,
}

const PLUGIN_NAME: &str = "rdev";

// Code referenced from
// https://github.com/liwenka1/bongo-cat-next/blob/891c3380e1d4a8cfe8452668632be8bd5086b46c/src-tauri/src/core/device.rs#L7
static IS_RUNNING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn start_listen<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
  #[cfg(target_os = "macos")]
  rdev::set_is_main_thread(false);

  // Events needed by
  // https://github.com/vueuse/vueuse/blob/f8c4e0a128e2d8df52cca0299a08bfd4dd8638da/packages/core/useMagicKeys/index.ts#L153C3-L153C19
  _ = listen(move |event: Event| {
    let event_name = match event.event_type {
      EventType::KeyPress(_) => "tauri-plugins:tauri-plugin-rdev:keydown",
      EventType::KeyRelease(_) => "tauri-plugins:tauri-plugin-rdev:keyup",
      EventType::ButtonPress(_) => "tauri-plugins:tauri-plugin-rdev:mousedown",
      EventType::ButtonRelease(_) => "tauri-plugins:tauri-plugin-rdev:mouseup",
      EventType::MouseMove { .. } => "tauri-plugins:tauri-plugin-rdev:mousemove",
      _ => return,
    };

    let state = app.state::<Mutex<PluginState>>();
    let state = match state.lock() {
      Ok(s) => s,
      Err(e) => {
        error!("PluginState mutex is poisoned: {}", e);
        return;
      }
    };

    for label in &state.window_labels {
      if let Err(e) = app.emit_to(label, event_name, &event) {
        error!(
          "Failed to emit rdev event '{}' to window '{}': {}",
          event_name, label, e
        );
      }
    }
  })
  .map_err(|e| {
    error!("Failed to start rdev listener: {:?}", e);
  });
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  PluginBuilder::new(PLUGIN_NAME)
    .setup(|app, _| {
      app.manage(Mutex::new(PluginState {
        window_labels: vec![],
      }));

      // Code referenced from
      // https://github.com/liwenka1/bongo-cat-next/blob/891c3380e1d4a8cfe8452668632be8bd5086b46c/src-tauri/src/core/device.rs#L7
      if IS_RUNNING.load(Ordering::SeqCst) {
        return Ok(());
      }

      IS_RUNNING.store(true, Ordering::SeqCst);

      let app = app.clone();

      std::thread::spawn(move || {
        start_listen(app);
      });

      Ok(())
    })
    .on_window_ready(|window| {
      let app = window.app_handle();
      let state = app.state::<Mutex<PluginState>>();
      let mut state = state.lock().unwrap();

      state
        .window_labels
        .push(window.label().to_string());

      let window_cloned = window.clone();

      window.on_window_event(move |event| match event {
        tauri::WindowEvent::CloseRequested { .. } => {
          let app = window_cloned.app_handle();
          let state = app.state::<Mutex<PluginState>>();
          let mut state = state.lock().unwrap();

          state
            .window_labels
            .retain(|label| label != window_cloned.label());
        }
        _ => {}
      });
    })
    .build()
}
