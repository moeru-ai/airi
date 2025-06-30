use std::sync::{
  Arc,
  atomic::{AtomicBool, Ordering},
};

use tauri::{Emitter, Manager, Runtime};

#[derive(Default)]
pub struct WindowClickThroughState {
  pub monitoring_enabled: Arc<AtomicBool>,
  pub enabled:            Arc<AtomicBool>,
}

pub fn set_pass_through_enabled<R: Runtime>(
  window: &tauri::Window<R>,
  enabled: bool,
) -> Result<(), String> {
  let state = window.state::<WindowClickThroughState>();

  state.enabled.store(enabled, Ordering::Relaxed);

  window
    .set_ignore_cursor_events(enabled)
    .map_err(|e| format!("Failed to set pass-through state: {e}"))?;

  let _ = window.emit(
    "tauri-app:proj-airi:window-pass-through-on-hover:pass-through-enabled",
    enabled,
  );

  Ok(())
}
