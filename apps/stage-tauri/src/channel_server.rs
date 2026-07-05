use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::{Arc, Mutex};

pub const DEFAULT_CHANNEL_SERVER_HOSTNAME: &str = "0.0.0.0";
pub const DEFAULT_CHANNEL_SERVER_AUTH_TOKEN: &str = "placeholder-token";
const RESERVED_CHANNEL_PORTS: std::ops::RangeInclusive<u16> = 3100..=3199;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChannelServerConfig {
    pub hostname: String,
    pub auth_token: String,
    pub port: Option<u16>,
}

impl Default for ChannelServerConfig {
    fn default() -> Self {
        Self {
            hostname: DEFAULT_CHANNEL_SERVER_HOSTNAME.to_string(),
            auth_token: DEFAULT_CHANNEL_SERVER_AUTH_TOKEN.to_string(),
            port: None,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelServerSnapshot {
    pub hostname: String,
    pub port: Option<u16>,
    pub lan_hosts: Vec<String>,
    pub auth_token: String,
    pub last_error: Option<String>,
}

#[derive(Clone, Default)]
pub struct ChannelServerState {
    inner: Arc<Mutex<ChannelServerSnapshot>>,
}

impl ChannelServerState {
    pub fn snapshot(&self) -> ChannelServerSnapshot {
        self.inner
            .lock()
            .expect("channel server state lock poisoned")
            .clone()
    }

    pub fn record_started(
        &self,
        hostname: String,
        port: u16,
        lan_hosts: Vec<String>,
        auth_token: String,
    ) {
        let mut snapshot = self
            .inner
            .lock()
            .expect("channel server state lock poisoned");
        *snapshot = ChannelServerSnapshot {
            hostname,
            port: Some(port),
            lan_hosts,
            auth_token,
            last_error: None,
        };
    }

    pub fn record_error(&self, error: impl Into<String>) {
        self.inner
            .lock()
            .expect("channel server state lock poisoned")
            .last_error = Some(error.into());
    }
}

pub fn is_reserved_channel_port(port: u16) -> bool {
    RESERVED_CHANNEL_PORTS.contains(&port)
}

pub fn format_channel_server_url(hostname: &str, port: u16) -> String {
    let host = match hostname {
        "0.0.0.0" | "::" => "localhost".to_string(),
        value if value.contains(':') && !value.starts_with('[') => format!("[{value}]"),
        value => value.to_string(),
    };

    format!("http://{host}:{port}")
}

pub fn preferred_qr_host(snapshot: &ChannelServerSnapshot) -> String {
    snapshot
        .lan_hosts
        .first()
        .cloned()
        .unwrap_or_else(|| "localhost".to_string())
}

pub fn health_body(snapshot: &ChannelServerSnapshot) -> String {
    json!({
        "status": "ok",
        "hostname": &snapshot.hostname,
        "port": snapshot.port,
        "lanHosts": &snapshot.lan_hosts,
    })
    .to_string()
}

fn http_response(status: &str, content_type: &str, body: &str, include_body: bool) -> Vec<u8> {
    let response_body = if include_body { body } else { "" };
    format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response_body}",
        response_body.len()
    )
    .into_bytes()
}

pub fn handle_http_request(request: &str, snapshot: &ChannelServerSnapshot) -> Vec<u8> {
    let Some(request_line) = request.lines().next() else {
        return http_response("400 Bad Request", "text/plain", "bad request", true);
    };
    let parts = request_line.split_whitespace().collect::<Vec<_>>();
    if parts.len() != 3 || !parts[2].starts_with("HTTP/") {
        return http_response("400 Bad Request", "text/plain", "bad request", true);
    }

    let method = parts[0];
    let path = parts[1];
    if !matches!(method, "GET" | "HEAD") {
        return http_response(
            "405 Method Not Allowed",
            "text/plain",
            "method not allowed",
            true,
        );
    }
    if path != "/health" {
        return http_response("404 Not Found", "text/plain", "not found", true);
    }

    let body = health_body(snapshot);
    http_response("200 OK", "application/json", &body, method == "GET")
}

pub async fn start_channel_server(
    _state: ChannelServerState,
    _config: ChannelServerConfig,
) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn active_snapshot() -> ChannelServerSnapshot {
        ChannelServerSnapshot {
            hostname: "0.0.0.0".to_string(),
            port: Some(49152),
            lan_hosts: vec!["192.168.1.10".to_string()],
            auth_token: "test-token".to_string(),
            last_error: None,
        }
    }

    fn response_text(bytes: Vec<u8>) -> String {
        String::from_utf8(bytes).expect("response is utf8")
    }

    #[test]
    fn detects_reserved_channel_ports() {
        assert!(!is_reserved_channel_port(3099));
        assert!(is_reserved_channel_port(3100));
        assert!(is_reserved_channel_port(3131));
        assert!(is_reserved_channel_port(3199));
        assert!(!is_reserved_channel_port(3200));
    }

    #[test]
    fn formats_channel_server_urls() {
        assert_eq!(
            format_channel_server_url("localhost", 49152),
            "http://localhost:49152"
        );
        assert_eq!(
            format_channel_server_url("192.168.1.10", 49152),
            "http://192.168.1.10:49152"
        );
        assert_eq!(
            format_channel_server_url("fe80::1", 49152),
            "http://[fe80::1]:49152"
        );
        assert_eq!(
            format_channel_server_url("0.0.0.0", 49152),
            "http://localhost:49152"
        );
    }

    #[test]
    fn prefers_lan_host_for_qr_urls() {
        let snapshot = active_snapshot();
        assert_eq!(preferred_qr_host(&snapshot), "192.168.1.10");

        let snapshot = ChannelServerSnapshot {
            lan_hosts: Vec::new(),
            ..snapshot
        };
        assert_eq!(preferred_qr_host(&snapshot), "localhost");
    }

    #[test]
    fn builds_health_json_from_snapshot() {
        let body = health_body(&active_snapshot());
        let value: serde_json::Value = serde_json::from_str(&body).expect("valid json");

        assert_eq!(value["status"], "ok");
        assert_eq!(value["hostname"], "0.0.0.0");
        assert_eq!(value["port"], 49152);
        assert_eq!(value["lanHosts"][0], "192.168.1.10");
    }

    #[test]
    fn builds_http_responses_for_supported_and_unsupported_requests() {
        let snapshot = active_snapshot();

        let ok = response_text(handle_http_request(
            "GET /health HTTP/1.1\r\nHost: localhost\r\n\r\n",
            &snapshot,
        ));
        assert!(ok.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(ok.contains("Content-Type: application/json\r\n"));
        assert!(ok.contains("\"status\":\"ok\""));

        let head = response_text(handle_http_request(
            "HEAD /health HTTP/1.1\r\nHost: localhost\r\n\r\n",
            &snapshot,
        ));
        assert!(head.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(head.ends_with("\r\n\r\n"));
        assert!(!head.contains("\"status\":\"ok\""));

        let missing = response_text(handle_http_request(
            "GET /missing HTTP/1.1\r\nHost: localhost\r\n\r\n",
            &snapshot,
        ));
        assert!(missing.starts_with("HTTP/1.1 404 Not Found\r\n"));

        let invalid_method = response_text(handle_http_request(
            "POST /health HTTP/1.1\r\nHost: localhost\r\n\r\n",
            &snapshot,
        ));
        assert!(invalid_method.starts_with("HTTP/1.1 405 Method Not Allowed\r\n"));

        let malformed = response_text(handle_http_request("not-http\r\n\r\n", &snapshot));
        assert!(malformed.starts_with("HTTP/1.1 400 Bad Request\r\n"));
    }

    #[test]
    fn snapshots_state_before_started_after_started_and_after_error() {
        let state = ChannelServerState::default();
        assert_eq!(state.snapshot().port, None);

        state.record_started(
            "0.0.0.0".to_string(),
            49152,
            vec!["192.168.1.10".to_string()],
            "test-token".to_string(),
        );
        assert_eq!(state.snapshot(), active_snapshot());

        state.record_error("bind failed");
        assert_eq!(state.snapshot().last_error.as_deref(), Some("bind failed"));
    }
}
