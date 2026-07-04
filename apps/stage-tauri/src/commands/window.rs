// Window commands matching @proj-airi/tauri-eventa contracts
// All commands use placeholder implementations - real implementations to follow

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::WebviewWindow;

// Bounds payload
#[derive(Debug, Serialize, Deserialize)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

// ResizeDirection type from eventa contract
#[derive(Debug, Serialize, Deserialize)]
pub struct ResizePayload {
    pub delta_x: i32,
    pub delta_y: i32,
    pub direction: String,
}

// Vibrancy type
#[derive(Debug, Serialize, Deserialize)]
pub struct VibrancyPayload {
    pub vibrancy: Value,
}

// Set ignore mouse events payload (no forward param in Tauri - documented limitation)
#[derive(Debug, Serialize, Deserialize)]
pub struct SetIgnoreMouseEventsPayload {
    pub ignore: bool,
}

/// Get window bounds - returns current window position and size in logical
/// (CSS) pixels. Tauri's `outer_position` / `outer_size` return physical
/// pixels, so we convert via the window's scale factor to match the Electron
/// contract expected by the renderer on HiDPI displays.
#[tauri::command]
pub async fn electron_window_get_bounds(window: WebviewWindow) -> Result<Bounds, String> {
    let scale_factor = window.scale_factor().map_err(|e| e.to_string())?;
    let pos = window
        .outer_position()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale_factor);
    let size = window
        .outer_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale_factor);
    Ok(Bounds {
        x: pos.x.round() as i32,
        y: pos.y.round() as i32,
        width: size.width.round() as i32,
        height: size.height.round() as i32,
    })
}

/// Set window bounds - positions and sizes the window
#[tauri::command]
pub async fn electron_window_set_bounds(
    window: WebviewWindow,
    #[allow(dead_code)]
    bounds: Option<Bounds>,
) -> Result<(), String> {
    // Placeholder: real implementation uses window.set_position and set_size
    let _ = (window, bounds);
    Ok(())
}

/// Set ignore mouse events for transparent click-through
/// Note: Tauri's set_ignore_cursor_events has no 'forward' param (documented regression)
#[tauri::command]
pub async fn electron_window_set_ignore_mouse_events(
    window: WebviewWindow,
    ignore: bool,
) -> Result<(), String> {
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| e.to_string())
}

/// Set vibrancy - static config on Tauri, no-op stub
#[tauri::command]
pub async fn electron_window_set_vibrancy(
    _window: WebviewWindow,
    vibrancy: Option<Value>,
) -> Result<(), String> {
    // Placeholder: vibrancy is static config on Tauri
    let _ = vibrancy;
    Ok(())
}

/// Set background material - no-op stub on Linux/Tauri
#[tauri::command]
pub async fn electron_window_set_background_material(
    _window: WebviewWindow,
    _material: Value,
) -> Result<(), String> {
    // Placeholder: no Tauri equivalent
    Ok(())
}

/// Resize window by delta expressed in logical (CSS) pixels. `outer_size`
/// returns physical pixels; converting to logical before applying the delta
/// avoids multiplying by the scale factor on every resize.
#[tauri::command]
pub async fn electron_window_resize(
    window: WebviewWindow,
    delta_x: i32,
    delta_y: i32,
    _direction: Option<String>,
) -> Result<(), String> {
    let scale_factor = window.scale_factor().map_err(|e| e.to_string())?;
    let size = window
        .outer_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale_factor);
    let new_width = (size.width + delta_x as f64).max(100.0);
    let new_height = (size.height + delta_y as f64).max(100.0);
    window
        .set_size(tauri::LogicalSize::new(new_width, new_height))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Close window
#[tauri::command]
pub async fn electron_window_close(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

/// Set always on top
#[tauri::command]
pub async fn electron_window_set_always_on_top(
    window: WebviewWindow,
    always_on_top: bool,
) -> Result<(), String> {
    window
        .set_always_on_top(always_on_top)
        .map_err(|e| e.to_string())
}
