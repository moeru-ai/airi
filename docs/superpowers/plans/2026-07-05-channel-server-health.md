# Channel Server Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start a Tauri-owned LAN-reachable HTTP channel server and expose `GET /health` on a dynamic non-reserved port.

**Architecture:** Add a focused Rust module, `apps/stage-tauri/src/channel_server.rs`, that owns startup config, shared state, port validation, URL formatting, minimal HTTP parsing, response generation, LAN host discovery, and the async listener loop. Register `ChannelServerState` in `main.rs`, spawn the server during setup, and update `server_channel.rs` commands to return the active server metadata instead of static placeholders.

**Tech Stack:** Rust 2021, Tauri v2 managed state, `tokio::net::TcpListener`, `tokio::io`, `serde`, `serde_json`.

## Global Constraints

- Use existing dependencies only: do not add `rcgen`, `tokio-rustls`, Hyper, Axum, or any HTTP framework.
- Keep this feature HTTP-first because `VAL-TAURI-SRV-001` requires `curl http://localhost:<port>/health`.
- Bind the server to `0.0.0.0` by default so LAN clients can reach it.
- Avoid selected ports in the reserved range `3100..=3199`.
- Preserve `tlsConfig: null` as the command contract extension point.
- Use TDD: write and run failing tests before production code for each behavior.
- Serena/jcodemunch MCP tools required by `AGENTS.md` are unavailable in this session; use native CLI fallback and record that in mission ledger notes.

---

## File Structure

- Create `apps/stage-tauri/src/channel_server.rs`: channel server config, shared state, snapshots, helper functions, minimal HTTP server loop, and Rust unit/async tests.
- Modify `apps/stage-tauri/src/main.rs`: declare `mod channel_server;`, create one `ChannelServerState`, manage it in Tauri, and spawn the server from setup.
- Modify `apps/stage-tauri/src/commands/server_channel.rs`: consume `tauri::State<ChannelServerState>` and return active config/QR data.
- Modify mission files under `docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/`: `features.json`, `validation-state.json`, and `progress_log.jsonl`.

### Task 1: Channel Server Core Module

**Files:**
- Create: `apps/stage-tauri/src/channel_server.rs`

**Interfaces:**
- Produces:
  - `pub const DEFAULT_CHANNEL_SERVER_HOSTNAME: &str = "0.0.0.0";`
  - `pub const DEFAULT_CHANNEL_SERVER_AUTH_TOKEN: &str = "placeholder-token";`
  - `pub struct ChannelServerConfig { pub hostname: String, pub auth_token: String, pub port: Option<u16> }`
  - `impl Default for ChannelServerConfig`
  - `pub struct ChannelServerSnapshot { pub hostname: String, pub port: Option<u16>, pub lan_hosts: Vec<String>, pub auth_token: String, pub last_error: Option<String> }`
  - `pub struct ChannelServerState`
  - `impl ChannelServerState { pub fn snapshot(&self) -> ChannelServerSnapshot; pub fn record_started(&self, hostname: String, port: u16, lan_hosts: Vec<String>, auth_token: String); pub fn record_error(&self, error: impl Into<String>); }`
  - `pub fn is_reserved_channel_port(port: u16) -> bool`
  - `pub fn format_channel_server_url(hostname: &str, port: u16) -> String`
  - `pub fn preferred_qr_host(snapshot: &ChannelServerSnapshot) -> String`
  - `pub fn health_body(snapshot: &ChannelServerSnapshot) -> String`
  - `pub fn handle_http_request(request: &str, snapshot: &ChannelServerSnapshot) -> Vec<u8>`
  - `pub async fn start_channel_server(state: ChannelServerState, config: ChannelServerConfig) -> Result<(), String>`

- Later tasks consume `ChannelServerState`, `ChannelServerConfig`, `format_channel_server_url`, and `preferred_qr_host`.

- [ ] **Step 1: Write failing core tests**

Create `apps/stage-tauri/src/channel_server.rs` with declarations that tests can reference and the following test module. Keep production functions as empty stubs that compile only if needed, but return incorrect values so tests fail for behavior rather than syntax.

```rust
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

pub const DEFAULT_CHANNEL_SERVER_HOSTNAME: &str = "0.0.0.0";
pub const DEFAULT_CHANNEL_SERVER_AUTH_TOKEN: &str = "placeholder-token";

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
        self.inner.lock().expect("channel server state lock poisoned").clone()
    }

    pub fn record_started(
        &self,
        hostname: String,
        port: u16,
        lan_hosts: Vec<String>,
        auth_token: String,
    ) {
        let mut snapshot = self.inner.lock().expect("channel server state lock poisoned");
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

pub fn is_reserved_channel_port(_port: u16) -> bool {
    false
}

pub fn format_channel_server_url(_hostname: &str, _port: u16) -> String {
    String::new()
}

pub fn preferred_qr_host(_snapshot: &ChannelServerSnapshot) -> String {
    String::new()
}

pub fn health_body(_snapshot: &ChannelServerSnapshot) -> String {
    "{}".to_string()
}

pub fn handle_http_request(_request: &str, _snapshot: &ChannelServerSnapshot) -> Vec<u8> {
    b"HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        .to_vec()
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
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
cargo test --manifest-path apps/stage-tauri/Cargo.toml channel_server
```

Expected: FAIL. The failure should come from behavior assertions such as `detects_reserved_channel_ports`, `formats_channel_server_urls`, `builds_health_json_from_snapshot`, or `builds_http_responses_for_supported_and_unsupported_requests`, not from syntax errors.

- [ ] **Step 3: Implement minimal core behavior**

Replace the stub helper implementations in `apps/stage-tauri/src/channel_server.rs` with:

```rust
use serde_json::json;

const RESERVED_CHANNEL_PORTS: std::ops::RangeInclusive<u16> = 3100..=3199;

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
        "hostname": snapshot.hostname,
        "port": snapshot.port,
        "lanHosts": snapshot.lan_hosts,
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
```

- [ ] **Step 4: Run core tests to verify GREEN**

Run:

```bash
cargo test --manifest-path apps/stage-tauri/Cargo.toml channel_server
```

Expected: PASS for the core `channel_server` tests added so far.

- [ ] **Step 5: Commit core module tests and helpers**

Run:

```bash
git add apps/stage-tauri/src/channel_server.rs
git commit -m "feat(stage-tauri): add channel server health core"
```

### Task 2: Async Listener and Startup Metadata

**Files:**
- Modify: `apps/stage-tauri/src/channel_server.rs`

**Interfaces:**
- Consumes: `ChannelServerState`, `ChannelServerConfig`, `handle_http_request`.
- Produces: working `start_channel_server(state, config) -> Result<(), String>` that records selected port and serves `/health`.

- [ ] **Step 1: Add failing async server test**

Append this test to the existing `#[cfg(test)] mod tests` in `apps/stage-tauri/src/channel_server.rs`:

```rust
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

        let mut response = String::new();
        stream
            .read_to_string(&mut response)
            .await
            .expect("reads response");

        assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(response.contains("\"status\":\"ok\""));
        assert!(response.contains("\"port\":"));

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
```

- [ ] **Step 2: Run async test to verify RED**

Run:

```bash
cargo test --manifest-path apps/stage-tauri/Cargo.toml channel_server::tests::serves_health_over_tcp_on_dynamic_port
```

Expected: FAIL because the current `start_channel_server` returns immediately and never records a port or accepts TCP connections.

- [ ] **Step 3: Implement listener startup and request serving**

Add these imports near the top of `channel_server.rs`:

```rust
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
```

Replace `start_channel_server` and add its helpers:

```rust
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
        let (stream, _) = listener.accept().await.map_err(|error| {
            let message = error.to_string();
            state.record_error(message.clone());
            message
        })?;
        let connection_state = state.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = serve_connection(stream, connection_state).await {
                eprintln!("channel server connection failed: {error}");
            }
        });
    }
}

async fn bind_channel_listener(config: &ChannelServerConfig) -> std::io::Result<TcpListener> {
    if let Some(port) = config.port {
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

async fn serve_connection(
    mut stream: TcpStream,
    state: ChannelServerState,
) -> std::io::Result<()> {
    let mut buffer = vec![0_u8; 8192];
    let bytes_read = stream.read(&mut buffer).await?;
    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let snapshot = state.snapshot();
    let response = handle_http_request(&request, &snapshot);
    stream.write_all(&response).await?;
    stream.shutdown().await
}

fn discover_lan_hosts() -> Vec<String> {
    let Ok(socket) = UdpSocket::bind(SocketAddr::new(
        IpAddr::V4(Ipv4Addr::UNSPECIFIED),
        0,
    )) else {
        return Vec::new();
    };
    if socket.connect("8.8.8.8:80").is_err() {
        return Vec::new();
    }
    let Ok(addr) = socket.local_addr() else {
        return Vec::new();
    };
    let host = addr.ip();
    if host.is_loopback() || host.is_unspecified() {
        Vec::new()
    } else {
        vec![host.to_string()]
    }
}
```

- [ ] **Step 4: Run async and module tests to verify GREEN**

Run:

```bash
cargo test --manifest-path apps/stage-tauri/Cargo.toml channel_server
```

Expected: PASS for all channel server tests.

- [ ] **Step 5: Commit listener implementation**

Run:

```bash
git add apps/stage-tauri/src/channel_server.rs
git commit -m "feat(stage-tauri): serve channel health endpoint"
```

### Task 3: Tauri Setup Wiring

**Files:**
- Modify: `apps/stage-tauri/src/main.rs`

**Interfaces:**
- Consumes: `channel_server::ChannelServerState` and `channel_server::ChannelServerConfig::default()`.
- Produces: app setup that registers the state and starts the channel server task.

- [ ] **Step 1: Add compile-failing wiring**

Modify `apps/stage-tauri/src/main.rs`:

```rust
mod app_lifecycle;
mod channel_server;
mod commands;
mod window_manager;
```

Inside `fn main()`, before `tauri::Builder::default()`, create one state:

```rust
    let channel_server_state = channel_server::ChannelServerState::default();
```

In the builder chain, add:

```rust
        .manage(channel_server_state.clone())
```

At the top of `.setup(|app| { ... })`, after `let handle = app.handle().clone();`, spawn the server:

```rust
            {
                let state = channel_server_state.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = channel_server::start_channel_server(
                        state,
                        channel_server::ChannelServerConfig::default(),
                    )
                    .await
                    {
                        eprintln!("failed to start channel server: {error}");
                    }
                });
            }
```

- [ ] **Step 2: Run build check**

Run:

```bash
cargo build --manifest-path apps/stage-tauri/Cargo.toml
```

Expected before Task 1 and Task 2 are complete: FAIL because `channel_server` does not exist or lacks implemented items. Expected after Task 1 and Task 2: PASS with known placeholder warnings.

- [ ] **Step 3: Commit setup wiring**

Run:

```bash
git add apps/stage-tauri/src/main.rs
git commit -m "feat(stage-tauri): start channel server during setup"
```

### Task 4: Server Channel Commands

**Files:**
- Modify: `apps/stage-tauri/src/commands/server_channel.rs`

**Interfaces:**
- Consumes:
  - `tauri::State<'_, ChannelServerState>`
  - `ChannelServerState::snapshot()`
  - `preferred_qr_host(&ChannelServerSnapshot) -> String`
  - `format_channel_server_url(&str, u16) -> String`
- Produces command handlers compatible with existing `tauri::generate_handler!` registration.

- [ ] **Step 1: Add state-aware command code**

Replace `apps/stage-tauri/src/commands/server_channel.rs` with:

```rust
// Server-channel commands matching apps/stage-tamagotchi/src/shared/eventa contracts

use crate::channel_server::{
    format_channel_server_url, preferred_qr_host, ChannelServerState,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

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
pub async fn electron_server_channel_get_config(
    state: State<'_, ChannelServerState>,
) -> Value {
    let snapshot = state.snapshot();
    serde_json::json!({
        "authToken": snapshot.auth_token,
        "hostname": snapshot.hostname,
        "tlsConfig": null,
    })
}

/// Apply server channel config
#[tauri::command]
pub async fn electron_server_channel_apply_config(
    _config: Option<Value>,
    state: State<'_, ChannelServerState>,
) -> Value {
    let snapshot = state.snapshot();
    serde_json::json!({
        "authToken": snapshot.auth_token,
        "hostname": snapshot.hostname,
        "tlsConfig": null,
    })
}

/// Get QR payload for channel server connection
#[tauri::command]
pub async fn electron_server_channel_get_qr_payload(
    state: State<'_, ChannelServerState>,
) -> ServerChannelQrPayload {
    let snapshot = state.snapshot();
    let Some(port) = snapshot.port else {
        return ServerChannelQrPayload {
            url: String::new(),
            token: String::new(),
        };
    };

    let host = preferred_qr_host(&snapshot);
    ServerChannelQrPayload {
        url: format_channel_server_url(&host, port),
        token: snapshot.auth_token,
    }
}
```

- [ ] **Step 2: Run command build check**

Run:

```bash
cargo build --manifest-path apps/stage-tauri/Cargo.toml
```

Expected: PASS with the known placeholder dead-code warnings reduced or unchanged. If Tauri command macro reports argument ordering issues for `apply_config`, move `state` before `_config` and rerun.

- [ ] **Step 3: Commit command wiring**

Run:

```bash
git add apps/stage-tauri/src/commands/server_channel.rs
git commit -m "feat(stage-tauri): expose active channel server config"
```

### Task 5: Verification and Mission Ledger

**Files:**
- Modify: `docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/features.json`
- Modify: `docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/validation-state.json`
- Modify: `docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/progress_log.jsonl`

**Interfaces:**
- Consumes: verification command output and current commit SHA.
- Produces: mission ledger that records implementation state, validation evidence, runtime evidence gaps, and MCP fallback note.

- [ ] **Step 1: Run full verification**

Run:

```bash
cargo fmt --manifest-path apps/stage-tauri/Cargo.toml --check
cargo test --manifest-path apps/stage-tauri/Cargo.toml channel_server
cargo test --manifest-path apps/stage-tauri/Cargo.toml
cargo build --manifest-path apps/stage-tauri/Cargo.toml
git diff --check
```

Expected:
- `cargo fmt --check`: exit 0.
- `cargo test ... channel_server`: exit 0 with the channel server tests passing.
- `cargo test`: exit 0 with all Rust tests passing.
- `cargo build`: exit 0 with only known warnings if warnings remain.
- `git diff --check`: exit 0.

- [ ] **Step 2: Update `features.json`**

Find the `channel-server-health` feature object. Set:

```json
"status": "implementation-complete-runtime-evidence-pending"
```

Append a note to any existing notes/evidence field if present, or update the nearest status text, with:

```text
Implemented HTTP-first Tauri channel server on a dynamic non-reserved port. Unit and async TCP tests verify /health locally. Runtime LAN curl evidence remains pending.
```

- [ ] **Step 3: Update `validation-state.json`**

For `VAL-TAURI-SRV-001`, set status to implementation complete or equivalent existing enum used in the file and add evidence:

```text
cargo test --manifest-path apps/stage-tauri/Cargo.toml channel_server verifies dynamic TCP /health returns HTTP 200 JSON.
```

For `VAL-CROSS-003`, keep status runtime-evidence pending and add evidence:

```text
Server binds to 0.0.0.0 and records LAN host candidates; second-machine curl evidence remains pending.
```

- [ ] **Step 4: Append `progress_log.jsonl` entry**

Append one JSON line shaped like:

```json
{"timestamp":"2026-07-05T00:00:00.000Z","type":"worker_completed","featureId":"channel-server-health","successState":"implementation-complete-runtime-evidence-pending","repoPath":"/home/vi/anima/.worktrees/channel-server-health","branch":"vi/feat/channel-server-health","commitId":"<HEAD>","verification":["cargo fmt --manifest-path apps/stage-tauri/Cargo.toml --check","cargo test --manifest-path apps/stage-tauri/Cargo.toml channel_server","cargo test --manifest-path apps/stage-tauri/Cargo.toml","cargo build --manifest-path apps/stage-tauri/Cargo.toml","git diff --check"],"notes":["HTTP-first implementation intentionally defers TLS/rcgen because VAL-TAURI-SRV-001 requires curl http://localhost:<port>/health.","Runtime LAN curl evidence remains pending.","Serena/jcodemunch MCP tools from AGENTS.md are unavailable in this session; native tools used as fallback."],"nextSteps":["Open PR for channel-server-health.","Merge after review/checks when only documented runtime evidence gaps remain."]}
```

Use the actual UTC timestamp and actual `git rev-parse --short HEAD` commit after implementation commits.

- [ ] **Step 5: Validate mission JSON and commit ledger**

Run:

```bash
jq empty docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/features.json
jq empty docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/validation-state.json
jq -c . docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/progress_log.jsonl >/tmp/channel-server-health-progress-log.check
git add docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/features.json docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/validation-state.json docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/progress_log.jsonl
git commit -m "docs(mission): record channel server health"
```

Expected: JSON validation commands exit 0 and ledger commit succeeds.

### Task 6: Final Review, PR, and Merge Readiness

**Files:**
- No direct code edits unless review finds issues.

**Interfaces:**
- Consumes: completed branch and verification evidence.
- Produces: review result, pushed branch, and PR/merge decision.

- [ ] **Step 1: Run final status and diff review**

Run:

```bash
git status --short --branch
git log --oneline --decorate -5
git diff --stat origin/main..HEAD
git diff --check origin/main..HEAD
```

Expected: branch has only planned commits; no whitespace errors.

- [ ] **Step 2: Request review**

If subagent review tooling is available, use `superpowers:requesting-code-review` with:

```text
DESCRIPTION: Implemented Tauri channel server health endpoint with dynamic non-reserved HTTP port and server-channel command state.
PLAN_OR_REQUIREMENTS: docs/superpowers/plans/2026-07-05-channel-server-health.md and docs/superpowers/specs/2026-07-05-channel-server-health-design.md.
BASE_SHA: origin/main
HEAD_SHA: HEAD
```

If subagent review tooling is unavailable, run a local review pass by reading `git diff origin/main..HEAD` and checking for blocking issues in listener lifecycle, state locking, command payload shape, and mission ledger JSON.

- [ ] **Step 3: Push branch and open PR**

Run:

```bash
git push -u origin vi/feat/channel-server-health
gh pr create --base main --head vi/feat/channel-server-health --title "feat(stage-tauri): add channel server health endpoint" --body-file /tmp/channel-server-health-pr.md
```

The PR body must include:
- summary of the HTTP-first implementation;
- tests run;
- runtime LAN curl evidence pending note;
- MCP fallback note.

- [ ] **Step 4: Merge only after review/check assessment**

Before merging, re-run the verification commands from Task 5 Step 1. If checks are clean or only blocked by documented external/runtime-evidence gaps and the user authorizes merge, merge the PR and update the mission ledger with a `pr_merged` entry.

## Self-Review

- Spec coverage: the plan covers dynamic non-reserved port selection, `0.0.0.0` binding, `/health` JSON, HTTP response statuses, shared state, Tauri startup, server-channel command payloads, verification, and mission ledger updates.
- Placeholder scan: no unfinished-marker text or unspecified implementation steps remain. The only placeholder value is the existing auth-token compatibility string.
- Type consistency: later tasks use the same `ChannelServerState`, `ChannelServerConfig`, `ChannelServerSnapshot`, `format_channel_server_url`, and `preferred_qr_host` names defined in Task 1.
