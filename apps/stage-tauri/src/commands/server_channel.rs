// Server-channel commands matching apps/stage-tamagotchi/src/shared/eventa contracts

use crate::channel_server::{
    format_channel_server_url, preferred_qr_host, ChannelServerSnapshot, ChannelServerState,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerChannelQrPayload {
    pub url: String,
    pub token: String,
}

/// Get server channel config
#[tauri::command]
pub async fn electron_server_channel_get_config(
    state: State<'_, ChannelServerState>,
) -> Result<Value, String> {
    Ok(config_payload_from_snapshot(&state.snapshot()))
}

/// Apply server channel config
#[tauri::command]
pub async fn electron_server_channel_apply_config(
    state: State<'_, ChannelServerState>,
    _config: Option<Value>,
) -> Result<Value, String> {
    Ok(config_payload_from_snapshot(&state.snapshot()))
}

/// Get QR payload for channel server connection
#[tauri::command]
pub async fn electron_server_channel_get_qr_payload(
    state: State<'_, ChannelServerState>,
) -> Result<ServerChannelQrPayload, String> {
    Ok(qr_payload_from_snapshot(&state.snapshot()))
}

fn config_payload_from_snapshot(snapshot: &ChannelServerSnapshot) -> Value {
    serde_json::json!({
        "authToken": snapshot.auth_token.clone(),
        "hostname": snapshot.hostname.clone(),
        "tlsConfig": null,
    })
}

fn qr_payload_from_snapshot(snapshot: &ChannelServerSnapshot) -> ServerChannelQrPayload {
    let Some(port) = snapshot.port else {
        return ServerChannelQrPayload {
            url: String::new(),
            token: String::new(),
        };
    };

    let host = preferred_qr_host(snapshot);
    ServerChannelQrPayload {
        url: format_channel_server_url(&host, port),
        token: snapshot.auth_token.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::channel_server::ChannelServerSnapshot;

    fn active_snapshot() -> ChannelServerSnapshot {
        ChannelServerSnapshot {
            hostname: "0.0.0.0".to_string(),
            port: Some(49152),
            lan_hosts: vec!["192.168.1.10".to_string()],
            auth_token: "test-token".to_string(),
            last_error: None,
        }
    }

    #[test]
    fn config_payload_uses_active_channel_server_snapshot() {
        let payload = config_payload_from_snapshot(&active_snapshot());

        assert_eq!(payload["authToken"], "test-token");
        assert_eq!(payload["hostname"], "0.0.0.0");
        assert_eq!(payload["tlsConfig"], serde_json::Value::Null);
    }

    #[test]
    fn qr_payload_prefers_lan_host_when_server_is_started() {
        let payload = qr_payload_from_snapshot(&active_snapshot());

        assert_eq!(payload.url, "http://192.168.1.10:49152");
        assert_eq!(payload.token, "test-token");
    }

    #[test]
    fn qr_payload_is_empty_until_server_port_is_known() {
        let payload = qr_payload_from_snapshot(&ChannelServerSnapshot::default());

        assert_eq!(payload.url, "");
        assert_eq!(payload.token, "");
    }
}
