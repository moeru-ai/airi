use std::sync::{
  atomic::{AtomicBool, Ordering},
  Arc,
};

use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct WindowClickThroughState {
  pub monitoring_enabled: Arc<AtomicBool>,
  pub enabled:            Arc<AtomicBool>,
  pub cursor_inside:      Arc<AtomicBool>,
}

pub fn set_cursor_inside(window: &tauri::Window, is_inside: bool) -> Result<(), String> {
  let state = window.state::<WindowClickThroughState>();

  state.cursor_inside.store(is_inside, Ordering::Relaxed);

  window.set_ignore_cursor_events(is_inside).map_err(|e| format!("Failed to set click-through state: {e}"))?;

  let _ = window.emit("tauri-app:window-click-through:is-inside", is_inside);

  Ok(())
}

pub fn set_click_through_enabled(window: &tauri::Window, enabled: bool) -> Result<(), String> {
  let state = window.state::<WindowClickThroughState>();

  state.enabled.store(enabled, Ordering::Relaxed);

  window.set_ignore_cursor_events(enabled).map_err(|e| format!("Failed to set click-through state: {e}"))?;

  let _ = window.emit("tauri-app:window-click-through:enabled", enabled);

  Ok(())
}
