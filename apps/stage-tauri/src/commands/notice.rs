// Notice window commands matching apps/stage-tamagotchi/src/shared/eventa contracts
// All commands use placeholder implementations

use serde_json::Value;

/// Open notice window - placeholder
#[tauri::command]
pub async fn electron_windows_notice_invoke_open(
    _route: Option<String>,
    _type: Option<String>,
    _payload: Option<Value>,
) -> Result<bool, String> {
    Ok(true)
}

/// Execute action on notice window - placeholder
#[tauri::command]
pub async fn electron_windows_notice_invoke_action(
    _id: Option<String>,
    _action: Option<String>,
) -> Result<(), String> {
    Ok(())
}

/// Signal page mounted in notice window - placeholder
#[tauri::command]
pub async fn electron_windows_notice_invoke_page_mounted(
    _id: Option<String>,
) -> Result<Option<Value>, String> {
    Ok(None)
}

/// Signal page unmounted from notice window - placeholder
#[tauri::command]
pub async fn electron_windows_notice_invoke_page_unmounted(
    _id: Option<String>,
) -> Result<(), String> {
    Ok(())
}
