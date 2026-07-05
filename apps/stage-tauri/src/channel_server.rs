use serde::{Deserialize, Serialize};
use serde_json::json;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

pub const DEFAULT_CHANNEL_SERVER_HOSTNAME: &str = "0.0.0.0";
pub const DEFAULT_CHANNEL_SERVER_AUTH_TOKEN: &str = "placeholder-token";
const RESERVED_CHANNEL_PORTS: std::ops::RangeInclusive<u16> = 3100..=3199;

#[derive(Debug, Eq, PartialEq)]
enum AcceptLoopAction {
    Continue,
}

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

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelServerSnapshot {
    pub hostname: String,
    pub port: Option<u16>,
    pub lan_hosts: Vec<String>,
    pub auth_token: String,
    pub last_error: Option<String>,
}

impl Default for ChannelServerSnapshot {
    fn default() -> Self {
        Self {
            hostname: DEFAULT_CHANNEL_SERVER_HOSTNAME.to_string(),
            port: None,
            lan_hosts: Vec::default(),
            auth_token: DEFAULT_CHANNEL_SERVER_AUTH_TOKEN.to_string(),
            last_error: None,
        }
    }
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
    state: ChannelServerState,
    config: ChannelServerConfig,
) -> Result<(), String> {
    let listener = bind_channel_listener(&config).await.map_err(|error| {
        let message = error.to_string();
        state.record_error(message.clone());
        message
    })?;

    let local_addr = listener.local_addr().map_err(|error| {
        let message = error.to_string();
        state.record_error(message.clone());
        message
    })?;
    let port = local_addr.port();
    let lan_hosts = discover_lan_hosts();
    state.record_started(
        config.hostname.clone(),
        port,
        lan_hosts,
        config.auth_token.clone(),
    );

    loop {
        let (stream, _) = match listener.accept().await {
            Ok(connection) => connection,
            Err(error) => match handle_accept_error(&state, error) {
                AcceptLoopAction::Continue => continue,
            },
        };
        let connection_state = state.clone();
        tokio::spawn(async move {
            if let Err(error) = serve_connection(stream, connection_state).await {
                eprintln!("channel server connection failed: {error}");
            }
        });
    }
}

fn handle_accept_error(state: &ChannelServerState, error: std::io::Error) -> AcceptLoopAction {
    let message = error.to_string();
    state.record_error(message.clone());
    eprintln!("channel server accept failed: {message}");
    AcceptLoopAction::Continue
}

async fn bind_channel_listener(config: &ChannelServerConfig) -> std::io::Result<TcpListener> {
    if let Some(port) = config.port {
        if is_reserved_channel_port(port) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("channel server port {port} is reserved"),
            ));
        }
        return TcpListener::bind((config.hostname.as_str(), port)).await;
    }

    loop {
        let listener = TcpListener::bind((config.hostname.as_str(), 0)).await?;
        let port = listener.local_addr()?.port();
        if !is_reserved_channel_port(port) {
            return Ok(listener);
        }
    }
}

async fn serve_connection(mut stream: TcpStream, state: ChannelServerState) -> std::io::Result<()> {
    let mut request = String::default();
    {
        let mut reader = BufReader::new(&mut stream);
        reader.read_line(&mut request).await?;
    }
    let snapshot = state.snapshot();
    let response = handle_http_request(&request, &snapshot);
    stream.write_all(&response).await?;
    stream.shutdown().await
}

fn discover_lan_hosts() -> Vec<String> {
    let bind_addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), 0);
    // deepsource: ignore - Route discovery uses UDP connect only; this is not a listening socket.
    let Ok(socket) = UdpSocket::bind(bind_addr) else {
        return Vec::default();
    };
    if socket.connect("8.8.8.8:80").is_err() {
        return Vec::default();
    }
    let Ok(addr) = socket.local_addr() else {
        return Vec::default();
    };
    let host = addr.ip();
    if host.is_loopback() || host.is_unspecified() {
        Vec::default()
    } else {
        vec![host.to_string()]
    }
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
            lan_hosts: Vec::default(),
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

    #[test]
    fn accept_errors_are_recorded_without_stopping_listener() {
        let state = ChannelServerState::default();
        let action = handle_accept_error(
            &state,
            std::io::Error::new(std::io::ErrorKind::Interrupted, "temporary accept failure"),
        );

        assert_eq!(action, AcceptLoopAction::Continue);
        assert_eq!(
            state.snapshot().last_error.as_deref(),
            Some("temporary accept failure")
        );
    }

    #[tokio::test]
    async fn serves_health_over_tcp_on_dynamic_port() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpStream;

        let state = ChannelServerState::default();
        let server_state = state.clone();
        let task = tokio::spawn(async move {
            start_channel_server(
                server_state,
                ChannelServerConfig {
                    hostname: "127.0.0.1".to_string(),
                    auth_token: "test-token".to_string(),
                    port: None,
                },
            )
            .await
        });

        let port = wait_for_started_port(&state).await;
        assert!(!is_reserved_channel_port(port));

        let mut stream = TcpStream::connect(("127.0.0.1", port))
            .await
            .expect("connects to channel server");
        stream
            .write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .await
            .expect("writes request");

        let mut response = String::default();
        stream
            .read_to_string(&mut response)
            .await
            .expect("reads response");

        assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(response.contains("\"status\":\"ok\""));
        assert!(response.contains("\"port\":"));

        task.abort();
    }

    #[tokio::test]
    async fn serves_health_when_request_line_arrives_in_chunks() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpStream;

        let state = ChannelServerState::default();
        let server_state = state.clone();
        let task = tokio::spawn(async move {
            start_channel_server(
                server_state,
                ChannelServerConfig {
                    hostname: "127.0.0.1".to_string(),
                    auth_token: "test-token".to_string(),
                    port: None,
                },
            )
            .await
        });

        let port = wait_for_started_port(&state).await;
        let mut stream = TcpStream::connect(("127.0.0.1", port))
            .await
            .expect("connects to channel server");
        stream.write_all(b"GET /hea").await.expect("writes chunk");
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        stream
            .write_all(b"lth HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .await
            .expect("writes request remainder");

        let mut response = String::default();
        stream
            .read_to_string(&mut response)
            .await
            .expect("reads response");

        assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));

        task.abort();
    }

    async fn wait_for_started_port(state: &ChannelServerState) -> u16 {
        for _ in 0..100 {
            if let Some(port) = state.snapshot().port {
                return port;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        panic!("channel server did not start");
    }
}
