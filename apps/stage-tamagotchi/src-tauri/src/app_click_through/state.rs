use std::sync::{
  Arc,
  atomic::{AtomicBool, Ordering},
};

use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct WindowClickThroughState {
  pub monitoring_enabled: Arc<AtomicBool>,
  pub enabled:            Arc<AtomicBool>,
}

pub fn set_click_through_enabled(
  window: &tauri::Window,
  enabled: bool,
) -> Result<(), String> {
  let state = window.state::<WindowClickThroughState>();

  state.enabled.store(enabled, Ordering::Relaxed);

  window
    .set_ignore_cursor_events(enabled)
    .map_err(|e| format!("Failed to set click-through state: {e}"))?;

  let _ = window.emit("tauri-app:window-click-through:enabled", enabled);

  Ok(())
}
