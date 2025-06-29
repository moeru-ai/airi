use anyhow::Result;
use log::debug;
use tauri::{Emitter, Manager};

#[tauri::command]
pub async fn plugins_window_get_display_info(window: tauri::Window) -> Result<()> {
  match window.current_monitor() {
    std::result::Result::Ok(optional_monitor) => match optional_monitor {
      Some(monitor) => {
        let monitor_size = monitor.size();
        window
          .emit(
            "tauri-app:invoke-returns:plugins-window-get-display-info",
            (
              (monitor_size.width, monitor_size.height),
              (monitor.position().x, monitor.position().y),
            ),
          )
          .map_err(|e| anyhow::anyhow!(format!("Failed to emit display info: {}", e)))?;

        todo!();
      },
      _ => Ok(()),
    },
    _ => Ok(()),
  }
}
