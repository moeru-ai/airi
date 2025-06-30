use tauri::{
  Monitor,
  Runtime,
  plugin::{Builder, TauriPlugin},
};

#[tauri::command]
pub async fn get_display_info<R: Runtime>(
  window: tauri::Window<R>
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
pub async fn get_current_window_info<R: Runtime>(
  window: tauri::Window<R>
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
pub async fn set_position<R: Runtime>(
  window: tauri::Window<R>,
  x: i32,
  y: i32,
) -> Result<(), String> {
  use tauri::Position;

  window
    .set_position(Position::Physical(tauri::PhysicalPosition { x, y }))
    .map_err(|e| format!("Failed to set window position: {}", e))
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("proj-airi-tauri-plugin-window")
    .invoke_handler(tauri::generate_handler![
      get_display_info,
      get_current_window_info,
      set_position
    ])
    .build()
}
