// Screen commands matching @proj-airi/tauri-eventa contracts
// All commands use placeholder implementations - real implementations to follow

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{Monitor, WebviewWindow};

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct Display {
    pub id: String,
    pub label: String,
    pub bounds: Bounds,
    pub scale_factor: f64,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

fn normalized_scale_factor(scale_factor: f64) -> f64 {
    if scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    }
}

fn logical_i32(value: f64, scale_factor: f64) -> i32 {
    (value / normalized_scale_factor(scale_factor)).round() as i32
}

fn display_from_physical_monitor(
    index: usize,
    name: Option<&str>,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
) -> Display {
    let display_number = index + 1;
    let id = name
        .filter(|name| !name.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("display-{index}-{x}-{y}"));
    let label = name
        .filter(|name| !name.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("Display {display_number}"));

    Display {
        id,
        label,
        bounds: Bounds {
            x: logical_i32(x as f64, scale_factor),
            y: logical_i32(y as f64, scale_factor),
            width: logical_i32(width as f64, scale_factor),
            height: logical_i32(height as f64, scale_factor),
        },
        scale_factor: normalized_scale_factor(scale_factor),
    }
}

fn display_from_monitor(index: usize, monitor: &Monitor) -> Display {
    let position = monitor.position();
    let size = monitor.size();
    display_from_physical_monitor(
        index,
        monitor.name().map(String::as_str),
        position.x,
        position.y,
        size.width,
        size.height,
        monitor.scale_factor(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_physical_monitor_bounds_to_logical_display_bounds() {
        let display = display_from_physical_monitor(1, Some("DP-2"), 3840, 240, 2560, 1440, 2.0);

        assert_eq!(display.id, "DP-2");
        assert_eq!(display.label, "DP-2");
        assert_eq!(
            display.bounds,
            Bounds {
                x: 1920,
                y: 120,
                width: 1280,
                height: 720,
            }
        );
        assert_eq!(display.scale_factor, 2.0);
    }

    #[test]
    fn creates_stable_display_identity_when_monitor_name_is_missing() {
        let display = display_from_physical_monitor(0, None, -1920, 0, 1920, 1080, 1.0);

        assert_eq!(display.id, "display-0--1920-0");
        assert_eq!(display.label, "Display 1");
        assert_eq!(
            display.bounds,
            Bounds {
                x: -1920,
                y: 0,
                width: 1920,
                height: 1080,
            }
        );
    }
}

/// Get all displays connected to the system
#[tauri::command]
pub async fn electron_screen_get_all_displays(
    window: WebviewWindow,
) -> Result<Vec<Display>, String> {
    Ok(window
        .available_monitors()
        .map_err(|e| e.to_string())?
        .iter()
        .enumerate()
        .map(|(index, monitor)| display_from_monitor(index, monitor))
        .collect())
}

/// Get the primary display
#[tauri::command]
pub async fn electron_screen_get_primary_display(window: WebviewWindow) -> Result<Display, String> {
    if let Some(primary) = window.primary_monitor().map_err(|e| e.to_string())? {
        return Ok(display_from_monitor(0, &primary));
    }

    if let Some(current) = window.current_monitor().map_err(|e| e.to_string())? {
        return Ok(display_from_monitor(0, &current));
    }

    window
        .available_monitors()
        .map_err(|e| e.to_string())?
        .first()
        .map(|monitor| display_from_monitor(0, monitor))
        .ok_or_else(|| "no displays available".to_string())
}

/// Get current cursor screen point
#[tauri::command]
pub async fn electron_screen_get_cursor_screen_point(
    window: WebviewWindow,
) -> Result<Point, String> {
    let cursor = window.cursor_position().map_err(|e| e.to_string())?;
    let scale_factor = window
        .monitor_from_point(cursor.x, cursor.y)
        .map_err(|e| e.to_string())?
        .map(|monitor| monitor.scale_factor())
        .unwrap_or(1.0);

    Ok(Point {
        x: logical_i32(cursor.x, scale_factor),
        y: logical_i32(cursor.y, scale_factor),
    })
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
