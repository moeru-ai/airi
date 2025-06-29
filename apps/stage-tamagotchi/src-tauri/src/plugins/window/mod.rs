use tauri::Monitor;

#[tauri::command]
pub async fn plugin_window_get_display_info(
  window: tauri::Window
) -> Result<(Vec<Monitor>, Monitor), String> {
  let monitors = match window.available_monitors() {
    std::result::Result::Ok(monitors) => monitors,
    _ => vec![],
  };
  let primary_monitor = match window.primary_monitor() {
    std::result::Result::Ok(monitor) => match monitor {
      Some(monitor) => monitor,
      None => {
        return Err("Primary monitor not found".to_string());
      },
    },
    _ => return Err("Failed to get primary monitor".to_string()),
  };

  Ok((monitors, primary_monitor))
}

#[tauri::command]
pub async fn plugins_window_get_current_window_info(
  window: tauri::Window
) -> Result<((u32, u32), (i32, i32)), String> {
  match window.current_monitor() {
    std::result::Result::Ok(optional_monitor) => match optional_monitor {
      Some(monitor) => {
        let monitor_size = monitor.size();
        let position = monitor.position();

        Ok((
          (monitor_size.width, monitor_size.height),
          (position.x, position.y),
        ))
      },
      _ => Ok(((0, 0), (0, 0))),
    },
    _ => Ok(((0, 0), (0, 0))),
  }
}

#[tauri::command]
pub async fn plugins_window_set_position(
  window: tauri::Window,
  x: i32,
  y: i32,
) -> Result<(), String> {
  use tauri::Position;

  window
    .set_position(Position::Physical(tauri::PhysicalPosition { x, y }))
    .map_err(|e| format!("Failed to set window position: {}", e))
}
