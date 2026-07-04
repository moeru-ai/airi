// System preferences commands matching @proj-airi/tauri-eventa contracts
/// Get media access status for camera/mic/screen. Returns "granted" on Linux as a stub.
#[tauri::command]
pub async fn electron_system_preferences_get_media_access_status(_access_type: String) -> String {
    // Placeholder: Tauri apps use OS native prompts via getUserMedia/getDisplayMedia
    // Return "granted" as a stub so the renderer doesn't block
    "granted".to_string()
}

/// Ask for media access. Returns "granted" as a stub on Linux.
#[tauri::command]
pub async fn electron_system_preferences_ask_for_media_access(_access_type: String) -> String {
    "granted".to_string()
}
