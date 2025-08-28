use log::debug;
use tauri::Result;

#[tauri::command]
pub fn show_window(
  app: tauri::AppHandle,
  label: String,
) -> Result<()> {
  crate::utils::get_window(&app, &label)?.show()
}

#[tauri::command]
pub fn debug_println(msg: serde_json::Value) -> Result<()> {
  debug!("{msg}");
  Ok(())
}
