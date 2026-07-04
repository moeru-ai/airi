// Screen commands matching @proj-airi/tauri-eventa contracts
// All commands use placeholder implementations - real implementations to follow

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::WebviewWindow;

#[derive(Debug, Serialize, Deserialize)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Display {
    pub id: String,
    pub label: String,
    pub bounds: Bounds,
    pub scale_factor: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// Get all displays connected to the system
#[tauri::command]
pub async fn electron_screen_get_all_displays(_window: WebviewWindow) -> Result<Vec<Display>, String> {
    // Placeholder: returns a single fake display
    Ok(vec![Display {
        id: "primary".to_string(),
        label: "Primary Display".to_string(),
        bounds: Bounds {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        },
        scale_factor: 1.0,
    }])
}

/// Get the primary display
#[tauri::command]
pub async fn electron_screen_get_primary_display(_window: WebviewWindow) -> Result<Display, String> {
    // Placeholder
    Ok(Display {
        id: "primary".to_string(),
        label: "Primary Display".to_string(),
        bounds: Bounds {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        },
        scale_factor: 1.0,
    })
}

/// Get current cursor screen point
#[tauri::command]
pub async fn electron_screen_get_cursor_screen_point(_window: WebviewWindow) -> Result<Point, String> {
    // Placeholder: returns origin
    Ok(Point { x: 0, y: 0 })
}

/// Convert DIP to screen point
#[tauri::command]
pub async fn electron_screen_dip_to_screen_point(
    _window: WebviewWindow,
    _point: Option<Point>,
) -> Result<Point, String> {
    Ok(Point { x: 0, y: 0 })
}

/// Convert DIP rect to screen rect
#[tauri::command]
pub async fn electron_screen_dip_to_screen_rect(
    _window: WebviewWindow,
    _rect: Option<Value>,
) -> Result<Value, String> {
    Ok(serde_json::json!({ "x": 0, "y": 0, "width": 100, "height": 100 }))
}

/// Convert screen point to DIP
#[tauri::command]
pub async fn electron_screen_screen_to_dip_point(
    _window: WebviewWindow,
    _point: Option<Point>,
) -> Result<Point, String> {
    Ok(Point { x: 0, y: 0 })
}

/// Convert screen rect to DIP
#[tauri::command]
pub async fn electron_screen_screen_to_dip_rect(
    _window: WebviewWindow,
    _rect: Option<Value>,
) -> Result<Value, String> {
    Ok(serde_json::json!({ "x": 0, "y": 0, "width": 100, "height": 100 }))
}
