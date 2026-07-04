// App commands matching @proj-airi/tauri-eventa contracts
// All commands use placeholder implementations

use serde_json::Value;
use tauri::AppHandle;

/// Check if running on macOS
#[tauri::command]
pub async fn electron_app_is_macos() -> bool {
    cfg!(target_os = "macos")
}

/// Check if running on Windows
#[tauri::command]
pub async fn electron_app_is_windows() -> bool {
    cfg!(target_os = "windows")
}

/// Check if running on Linux
#[tauri::command]
pub async fn electron_app_is_linux() -> bool {
    cfg!(target_os = "linux")
}

/// Quit the app
#[tauri::command]
pub async fn electron_app_quit(app: AppHandle) {
    app.exit(0);
}

/// Open the user data folder in file manager
#[tauri::command]
pub async fn electron_app_open_user_data_folder() -> Result<Value, String> {
    Ok(serde_json::json!({ "path": "~/.local/share/ai.moeru.airi-tauri" }))
}
