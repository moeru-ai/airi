// Server-channel commands matching apps/stage-tamagotchi/src/shared/eventa contracts
// All commands use placeholder implementations

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerChannelConfig {
    pub tls_config: Option<Value>,
    pub auth_token: String,
    pub hostname: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerChannelQrPayload {
    pub url: String,
    pub token: String,
}

/// Get server channel config
#[tauri::command]
pub async fn electron_server_channel_get_config() -> Value {
    serde_json::json!({
        "authToken": "placeholder-token",
        "hostname": "localhost",
        "tlsConfig": null,
    })
}

/// Apply server channel config
#[tauri::command]
pub async fn electron_server_channel_apply_config(
    _config: Option<Value>,
) -> Value {
    serde_json::json!({
        "authToken": "placeholder-token",
        "hostname": "localhost",
        "tlsConfig": null,
    })
}

/// Get QR payload for channel server connection
#[tauri::command]
pub async fn electron_server_channel_get_qr_payload() -> ServerChannelQrPayload {
    ServerChannelQrPayload {
        url: "https://localhost:3131".to_string(),
        token: "placeholder-token".to_string(),
    }
}
