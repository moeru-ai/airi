// Godot stage commands matching apps/stage-tamagotchi/src/shared/eventa contracts
// All commands use placeholder implementations

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
pub struct GodotStageStatus {
    pub state: String,
    pub pid: Option<i32>,
    pub last_error: Option<String>,
    pub updated_at: u64,
}

impl Default for GodotStageStatus {
    fn default() -> Self {
        Self {
            state: "stopped".to_string(),
            pid: None,
            last_error: None,
            updated_at: 0,
        }
    }
}

/// Start Godot sidecar - placeholder
#[tauri::command]
pub async fn electron_godot_stage_start() -> GodotStageStatus {
    GodotStageStatus::default()
}

/// Stop Godot sidecar - placeholder
#[tauri::command]
pub async fn electron_godot_stage_stop() -> GodotStageStatus {
    GodotStageStatus::default()
}

/// Get Godot sidecar status - placeholder
#[tauri::command]
pub async fn electron_godot_stage_get_status() -> GodotStageStatus {
    GodotStageStatus::default()
}

/// Apply scene input to Godot - placeholder
#[tauri::command]
pub async fn electron_godot_stage_apply_scene_input(_payload: Option<Value>) -> Result<(), String> {
    Ok(())
}

/// Get Godot view snapshot - placeholder
#[tauri::command]
pub async fn electron_godot_stage_view_snapshot_get() -> Option<Value> {
    None
}

/// Apply view patch to Godot - placeholder
#[tauri::command]
pub async fn electron_godot_stage_view_state_apply_patch(_patch: Option<Value>) -> Value {
    serde_json::json!({ "ok": true })
}

/// Request view snapshot from Godot - placeholder
#[tauri::command]
pub async fn electron_godot_stage_view_state_request_snapshot() -> Value {
    serde_json::json!({ "ok": true })
}
