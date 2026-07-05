// Server-channel commands matching apps/stage-tamagotchi/src/shared/eventa contracts

use crate::channel_server::{preferred_qr_host, ChannelServerSnapshot, ChannelServerState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

const SERVER_CHANNEL_QR_PAYLOAD_TYPE: &str = "airi:server-channel";
const SERVER_CHANNEL_QR_PAYLOAD_VERSION: u8 = 1;
const CHANNEL_SERVER_QR_UNAVAILABLE_ERROR: &str =
    "Channel server QR payload is not available until the server has started.";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerChannelQrPayload {
    #[serde(rename = "type")]
    pub payload_type: String,
    pub version: u8,
    pub urls: Vec<String>,
    pub auth_token: String,
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
    qr_payload_from_snapshot(&state.snapshot())
}

fn config_payload_from_snapshot(snapshot: &ChannelServerSnapshot) -> Value {
    serde_json::json!({
        "authToken": snapshot.auth_token.clone(),
        "hostname": snapshot.hostname.clone(),
        "tlsConfig": null,
    })
}

fn format_channel_server_websocket_url(hostname: &str, port: u16) -> String {
    let host = match hostname {
        "0.0.0.0" | "::" => "localhost".to_string(),
        value if value.contains(':') && !value.starts_with('[') => format!("[{value}]"),
        value => value.to_string(),
    };

    format!("ws://{host}:{port}/ws")
}

fn qr_payload_from_snapshot(
    snapshot: &ChannelServerSnapshot,
) -> Result<ServerChannelQrPayload, String> {
    let Some(port) = snapshot.port else {
        return Err(CHANNEL_SERVER_QR_UNAVAILABLE_ERROR.to_string());
    };

    let host = preferred_qr_host(snapshot);
    Ok(ServerChannelQrPayload {
        payload_type: SERVER_CHANNEL_QR_PAYLOAD_TYPE.to_string(),
        version: SERVER_CHANNEL_QR_PAYLOAD_VERSION,
        urls: vec![format_channel_server_websocket_url(&host, port)],
        auth_token: snapshot.auth_token.clone(),
    })
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
    fn qr_payload_matches_shared_contract() {
        let payload = qr_payload_from_snapshot(&active_snapshot()).expect("active QR payload");
        let value = serde_json::to_value(&payload).expect("serializes QR payload");

        assert_eq!(
            value,
            serde_json::json!({
                "type": "airi:server-channel",
                "version": 1,
                "urls": ["ws://192.168.1.10:49152/ws"],
                "authToken": "test-token",
            })
        );
    }

    #[test]
    fn qr_payload_uses_websocket_path_and_ipv6_brackets() {
        let snapshot = ChannelServerSnapshot {
            hostname: "0.0.0.0".to_string(),
            port: Some(49152),
            lan_hosts: vec!["fe80::1".to_string()],
            auth_token: "test-token".to_string(),
            last_error: None,
        };

        let payload = qr_payload_from_snapshot(&snapshot).expect("active QR payload");

        assert_eq!(payload.urls, vec!["ws://[fe80::1]:49152/ws"]);
    }

    #[test]
    fn qr_payload_prefers_lan_host_when_server_is_started() {
        let payload = qr_payload_from_snapshot(&active_snapshot()).expect("active QR payload");

        assert_eq!(payload.urls, vec!["ws://192.168.1.10:49152/ws"]);
        assert_eq!(payload.auth_token, "test-token");
    }

    #[test]
    fn qr_payload_errors_until_server_port_is_known() {
        let error = qr_payload_from_snapshot(&ChannelServerSnapshot::default())
            .expect_err("portless snapshot cannot produce shared QR payload");

        assert_eq!(
            error,
            "Channel server QR payload is not available until the server has started."
        );
    }
}
