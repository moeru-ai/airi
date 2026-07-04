// Misc commands matching apps/stage-tamagotchi/src/shared/eventa contracts
// All commands use placeholder implementations

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct MouseTrackingResult {
    pub ok: bool,
}

/// Start tracking mouse position globally - placeholder
#[tauri::command]
pub async fn electron_start_tracking_mouse_position() -> Result<MouseTrackingResult, String> {
    Ok(MouseTrackingResult { ok: true })
}

/// Start dragging window - placeholder
#[tauri::command]
pub async fn electron_start_dragging_window() -> Result<(), String> {
    Ok(())
}
