// Event broadcast command for the eventa fan-out proxy.
// The TauriEventaPubSub frontend adapter calls this to dispatch backend
// events to the correct webview(s): one backend, many windows.

use serde_json::Value;
use tauri::{Emitter, Manager, WebviewWindow};

/// Emit an event to a specific window or all windows.
///
/// `target` semantics:
/// - `"all"` or `"*"` — fan out to every webview (Tauri v2 `Emitter::emit`)
/// - `"current"` or `""` — emit only to the calling window
/// - any other label — emit to that specific window via `emit_to`
///
/// Tauri v2 renamed the broadcast helper: the bare `emit` (no target)
/// already fans out to all event targets, so it replaces Tauri v1's `emit_all`.
#[tauri::command]
pub async fn emit_event(
    window: WebviewWindow,
    target: String,
    event_name: String,
    payload: Value,
) -> Result<(), String> {
    let app = window.app_handle();
    if target == "all" || target == "*" {
        app.emit(&event_name, payload).map_err(|e| e.to_string())?;
    } else if target == "current" || target.is_empty() {
        window
            .emit(&event_name, payload)
            .map_err(|e| e.to_string())?;
    } else {
        app.emit_to(&target, &event_name, payload)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
