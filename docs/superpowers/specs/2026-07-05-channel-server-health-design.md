# Channel Server Health Design

## Goal

Start a Tauri-owned channel server during `apps/stage-tauri` setup and expose `GET /health` over plain HTTP so `curl http://localhost:<port>/health` returns HTTP 200 with a JSON body. The server must bind to a non-loopback interface for LAN reachability while avoiding the reserved port range `3100..=3199`.

## Scope

This feature implements the server lifecycle, health endpoint, dynamic port selection, and server-channel command state needed by the next QR feature. It does not implement WebSocket protocol traffic, QR rendering, persistent settings UI, or TLS transport.

TLS is intentionally deferred. The mission feature text mentions self-signed TLS via `rcgen`, but the validation contract for `VAL-TAURI-SRV-001` explicitly requires `curl http://localhost:<port>/health`. Keeping this feature HTTP-first produces direct evidence for the current validator and preserves `tlsConfig` as a later extension point.

## Architecture

Add a focused Rust module at `apps/stage-tauri/src/channel_server.rs`. The module owns server configuration, runtime state, health response construction, dynamic port selection, LAN address discovery, and the async listener loop.

`main.rs` will register a `ChannelServerState` with Tauri state management, then spawn the channel server from `setup` using `tauri::async_runtime::spawn`. The server binds to `0.0.0.0:0` by default, rejects selected ports in `3100..=3199`, and retries with another dynamic port if needed.

The existing `apps/stage-tauri/src/commands/server_channel.rs` command handlers will read the managed channel-server state. `electron_server_channel_get_config` and `electron_server_channel_apply_config` will return the active hostname, auth token, and `tlsConfig: null`; `electron_server_channel_get_qr_payload` will return a real URL derived from the active server state instead of the current `https://localhost:3131` placeholder.

## Data Flow

On startup, `main.rs` creates default channel-server state and starts the async server. The server binds a TCP listener, stores the selected bind address, selected port, and discovered LAN hosts in shared state, then accepts incoming connections.

For each connection, the server reads a minimal HTTP request. `GET /health` and `HEAD /health` return HTTP 200. All other paths return HTTP 404. Invalid methods return HTTP 405. Responses always include `Content-Length` and `Connection: close`.

The health JSON includes:

```json
{
  "status": "ok",
  "hostname": "0.0.0.0",
  "port": 49152,
  "lanHosts": ["192.168.1.10"]
}
```

The QR payload command remains basic for this feature. It should prefer a LAN host when one is available, otherwise `localhost`, and return an HTTP URL pointing at the active port. The next feature can replace that payload with the final encoded server-channel QR structure.

## Interfaces

`channel_server.rs` provides:

- `ChannelServerState`: cloneable shared state stored in Tauri via `.manage`.
- `ChannelServerSnapshot`: serializable view of active server state.
- `ChannelServerConfig`: startup config with hostname, auth token, and optional port.
- `start_channel_server(state: ChannelServerState, config: ChannelServerConfig) -> impl Future<Output = Result<(), String>>`.
- Pure helpers for port validation, health JSON generation, LAN host filtering, URL formatting, and HTTP response construction.

`server_channel.rs` consumes `tauri::State<ChannelServerState>` in command handlers.

## Error Handling

Server startup failures are logged to stderr from the setup task and stored in `ChannelServerState.last_error`. Commands can still return a config payload even if startup failed, but QR payload generation returns a URL only after a port is active; before that it returns an empty URL and token so the renderer does not crash.

Per-connection parsing is intentionally defensive and simple. Malformed requests get a 400 response where possible, then the connection closes. A failed connection must not stop the listener loop.

## Dependencies

Use the existing Rust dependencies only: `tokio`, `serde`, `serde_json`, and Tauri. Do not add an HTTP framework for this feature. Do not add `rcgen` or `tokio-rustls` until TLS has a validator that needs HTTPS or WSS behavior.

## Testing

Use TDD. Add unit tests in `channel_server.rs` before production code for:

- reserved port detection for `3100..=3199`;
- fallback URL formatting for IPv4, IPv6, LAN host, and localhost;
- health JSON content;
- HTTP response status for `/health`, unknown paths, invalid methods, and malformed requests;
- shared state snapshot before and after startup metadata is recorded.

Add an async server test that binds the server on a dynamic port, connects with `tokio::net::TcpStream`, sends `GET /health HTTP/1.1`, and asserts `HTTP/1.1 200 OK` plus JSON body. The test must abort the spawned server task after the assertion.

Verification commands:

- `cargo fmt --manifest-path apps/stage-tauri/Cargo.toml --check`
- `cargo test --manifest-path apps/stage-tauri/Cargo.toml channel_server`
- `cargo test --manifest-path apps/stage-tauri/Cargo.toml`
- `cargo build --manifest-path apps/stage-tauri/Cargo.toml`
- `git diff --check`

Runtime validation, when a desktop session is available:

- Start the Tauri app.
- Run `curl -i http://localhost:<port>/health`.
- Run `curl -i http://<LAN-IP>:<port>/health` from a second host or same-host LAN address.

## Mission Ledger

After implementation, update `docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/`:

- mark `channel-server-health` as implementation complete or runtime-evidence pending;
- update `VAL-TAURI-SRV-001` and `VAL-CROSS-003`;
- append verification and known blocker notes to `progress_log.jsonl`;
- keep noting that Serena/jcodemunch MCP tools are unavailable in this session and native CLI fallback was used.
