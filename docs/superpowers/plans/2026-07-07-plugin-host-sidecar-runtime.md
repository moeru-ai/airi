# Plugin Host Sidecar Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start and inspect an available plugin-host sidecar from Stage Tauri, while enabling the SDK node runtime to create WebSocket-backed plugin contexts.

**Architecture:** Add a focused Rust controller in `apps/stage-tauri/src/commands/sidecar.rs` that owns the sidecar child process, builds the CLI launch contract, probes `GET /health`, and exposes serializable status. Wire that controller into existing plugin commands without changing registry/config ownership. Implement the SDK node WebSocket branch by constructing Node's built-in `WebSocket` and passing it to the existing Eventa WebSocket adapter.

**Tech Stack:** Rust 2021, Tauri 2, Tokio already present, std process/network APIs, Vue/Tauri Eventa IPC, TypeScript, Vitest.

## Global Constraints

- No new dependencies or lockfile updates.
- Keep plugin manifest discovery and `plugins-v1.json` persistence behavior unchanged.
- Keep degraded behavior when the sidecar binary is missing or unhealthy.
- Do not build or bundle the real `pkg` plugin-host binary in this PR.
- Use TDD: write failing tests, verify red, implement minimal code, verify green.
- jcodemunch MCP is unavailable in this runtime; native `rg`, `sed`, `git`, and `apply_patch` are the documented fallback for this branch.

---

### Task 1: Rust Plugin-Host Sidecar Controller

**Files:**
- Modify: `apps/stage-tauri/src/commands/sidecar.rs`

**Interfaces:**
- Consumes: `resolve_plugin_host_sidecar_path(app_data_dir: &Path) -> Option<PathBuf>` from the existing sidecar resolver.
- Produces:
  - `PluginHostSidecarController::new(app_data_dir: PathBuf) -> Self`
  - `PluginHostSidecarController::start_blocking(&self) -> PluginHostSidecarStatus`
  - `PluginHostSidecarController::stop_blocking(&self) -> PluginHostSidecarStatus`
  - `PluginHostSidecarController::status_blocking(&self) -> PluginHostSidecarStatus`
  - `PluginHostSidecarStatus` serialized with camelCase fields.
  - `PluginHostSidecarState::{Stopped, Booting, Ready, Degraded}`

- [ ] **Step 1: Write failing Rust tests for status, launch args, health probe, and controller lifecycle**

Add these tests inside the existing `#[cfg(test)] mod tests` in `apps/stage-tauri/src/commands/sidecar.rs`:

```rust
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::thread;

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn unique_sidecar_test_dir(name: &str) -> PathBuf {
    let elapsed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system time");
    std::env::temp_dir().join(format!(
        "airi-plugin-host-sidecar-{name}-{}-{}",
        std::process::id(),
        elapsed.as_nanos(),
    ))
}

#[cfg(unix)]
fn write_fake_executable(path: &Path, body: &str) {
    fs::write(path, body).unwrap();
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(path).unwrap().permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions).unwrap();
}

#[test]
fn plugin_host_sidecar_status_serializes_camel_case_payload() {
    let status = PluginHostSidecarStatus {
        state: PluginHostSidecarState::Ready,
        pid: Some(42),
        endpoint: Some("http://127.0.0.1:49152".to_string()),
        executable_path: Some("/tmp/plugin-host".to_string()),
        last_error: None,
        updated_at: 123,
    };

    assert_eq!(
        serde_json::to_value(status).unwrap(),
        serde_json::json!({
            "state": "ready",
            "pid": 42,
            "endpoint": "http://127.0.0.1:49152",
            "executablePath": "/tmp/plugin-host",
            "updatedAt": 123,
        })
    );
}

#[test]
fn build_plugin_host_launch_uses_plugin_root_config_path_host_and_port() {
    let root = unique_sidecar_test_dir("launch");
    let executable = root.join("plugin-host");
    fs::create_dir_all(root.join("sidecars")).unwrap();
    fs::write(&executable, b"fake").unwrap();

    let launch = build_plugin_host_launch(&root, executable.clone(), 49152);

    assert_eq!(launch.executable, executable);
    assert_eq!(launch.endpoint, "http://127.0.0.1:49152");
    assert_eq!(
        launch.args,
        vec![
            format!("--airi-plugin-root={}", root.join("plugins").display()),
            format!("--airi-config-path={}", root.join("plugins-v1.json").display()),
            "--airi-host=127.0.0.1".to_string(),
            "--airi-port=49152".to_string(),
        ]
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn plugin_host_health_probe_accepts_http_200() {
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port();
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut buffer = [0_u8; 512];
        let _ = stream.read(&mut buffer).unwrap();
        stream
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
            .unwrap();
    });

    assert!(probe_plugin_host_health("127.0.0.1", port, std::time::Duration::from_secs(1)).is_ok());
    handle.join().unwrap();
}

#[test]
fn plugin_host_health_probe_rejects_non_200() {
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port();
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut buffer = [0_u8; 512];
        let _ = stream.read(&mut buffer).unwrap();
        stream
            .write_all(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .unwrap();
    });

    let error = probe_plugin_host_health("127.0.0.1", port, std::time::Duration::from_secs(1))
        .expect_err("non-200 health response should fail");
    assert!(error.contains("status"));
    handle.join().unwrap();
}

#[test]
fn plugin_host_start_degrades_when_binary_is_missing() {
    let _guard = env_lock().lock().unwrap();
    std::env::remove_var("AIRI_PLUGIN_HOST_PATH");
    let root = unique_sidecar_test_dir("missing");
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("sidecars")).unwrap();

    let controller = PluginHostSidecarController::new(root.clone());
    let status = controller.start_blocking();

    assert_eq!(status.state, PluginHostSidecarState::Degraded);
    assert_eq!(status.pid, None);
    assert!(status.last_error.unwrap().contains("AIRI_PLUGIN_HOST_PATH"));

    let _ = fs::remove_dir_all(&root);
}

#[cfg(unix)]
#[test]
fn plugin_host_start_ready_then_stop_with_fake_node_health_server() {
    let _guard = env_lock().lock().unwrap();
    std::env::remove_var("AIRI_PLUGIN_HOST_PATH");
    let root = unique_sidecar_test_dir("ready");
    let sidecars = root.join("sidecars");
    fs::create_dir_all(&sidecars).unwrap();

    let executable = sidecars.join("plugin-host-test");
    write_fake_executable(
        &executable,
        r#"#!/bin/sh
PORT=""
for arg in "$@"; do
  case "$arg" in
    --airi-port=*) PORT="${arg#--airi-port=}" ;;
  esac
done
exec node -e 'const http = require("node:http"); const port = Number(process.argv[1]); const server = http.createServer((req, res) => { if (req.url === "/health") { res.writeHead(200, {"content-type":"application/json"}); res.end("{\"ok\":true}"); } else { res.writeHead(404); res.end(""); } }); server.listen(port, "127.0.0.1"); setInterval(() => {}, 1000);' "$PORT"
"#,
    );

    std::env::set_var("AIRI_PLUGIN_HOST_PATH", &executable);
    let controller = PluginHostSidecarController::new(root.clone());

    let started = controller.start_blocking();
    assert_eq!(started.state, PluginHostSidecarState::Ready);
    assert!(started.pid.is_some());
    assert_eq!(started.executable_path.as_deref(), Some(executable.to_string_lossy().as_ref()));
    assert!(started.endpoint.as_deref().unwrap().starts_with("http://127.0.0.1:"));

    let stopped = controller.stop_blocking();
    assert_eq!(stopped.state, PluginHostSidecarState::Stopped);
    assert_eq!(stopped.pid, None);

    std::env::remove_var("AIRI_PLUGIN_HOST_PATH");
    let _ = fs::remove_dir_all(&root);
}
```

- [ ] **Step 2: Run tests to verify red**

Run: `cargo test --manifest-path apps/stage-tauri/Cargo.toml sidecar -- --test-threads=1`

Expected: FAIL with missing types/functions such as `PluginHostSidecarStatus`, `build_plugin_host_launch`, and `probe_plugin_host_health`.

- [ ] **Step 3: Implement the sidecar controller**

Add the implementation to `apps/stage-tauri/src/commands/sidecar.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const PLUGIN_HOST_ENV: &str = "AIRI_PLUGIN_HOST_PATH";
const PLUGIN_HOST_HEALTH_HOST: &str = "127.0.0.1";
const PLUGIN_HOST_HEALTH_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginHostSidecarStatus {
    pub state: PluginHostSidecarState,
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executable_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    pub updated_at: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PluginHostSidecarState {
    Stopped,
    Booting,
    Ready,
    Degraded,
}

impl PluginHostSidecarState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Stopped => "stopped",
            Self::Booting => "booting",
            Self::Ready => "ready",
            Self::Degraded => "degraded",
        }
    }
}

#[derive(Debug)]
struct PluginHostSidecarLaunch {
    executable: PathBuf,
    args: Vec<String>,
    endpoint: String,
    host: String,
    port: u16,
}

pub struct PluginHostSidecarController {
    app_data_dir: PathBuf,
    inner: Mutex<PluginHostSidecarControllerInner>,
}

struct PluginHostSidecarControllerInner {
    child: Option<Child>,
    status: PluginHostSidecarStatus,
}
```

Implement these methods and helpers with the following behavior:

```rust
impl Default for PluginHostSidecarStatus {
    fn default() -> Self {
        Self {
            state: PluginHostSidecarState::Stopped,
            pid: None,
            endpoint: None,
            executable_path: None,
            last_error: None,
            updated_at: current_timestamp_ms(),
        }
    }
}

impl PluginHostSidecarStatus {
    fn booting(endpoint: String, executable_path: String) -> Self {
        Self {
            state: PluginHostSidecarState::Booting,
            pid: None,
            endpoint: Some(endpoint),
            executable_path: Some(executable_path),
            last_error: None,
            updated_at: current_timestamp_ms(),
        }
    }

    fn ready(pid: u32, endpoint: String, executable_path: String) -> Self {
        Self {
            state: PluginHostSidecarState::Ready,
            pid: Some(pid),
            endpoint: Some(endpoint),
            executable_path: Some(executable_path),
            last_error: None,
            updated_at: current_timestamp_ms(),
        }
    }

    fn degraded(message: impl Into<String>) -> Self {
        Self {
            state: PluginHostSidecarState::Degraded,
            pid: None,
            endpoint: None,
            executable_path: None,
            last_error: Some(message.into()),
            updated_at: current_timestamp_ms(),
        }
    }

    fn stopped() -> Self { Self::default() }
}

impl PluginHostSidecarController {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            app_data_dir,
            inner: Mutex::new(PluginHostSidecarControllerInner {
                child: None,
                status: PluginHostSidecarStatus::default(),
            }),
        }
    }

    pub fn start_blocking(&self) -> PluginHostSidecarStatus {
        let mut inner = self.inner.lock().unwrap();
        inner.refresh_child_status();

        if matches!(inner.status.state, PluginHostSidecarState::Ready | PluginHostSidecarState::Booting)
            && inner.child.is_some()
        {
            return inner.status.clone();
        }

        let Some(executable) = resolve_plugin_host_sidecar_path(&self.app_data_dir) else {
            inner.child = None;
            inner.status = PluginHostSidecarStatus::degraded(format!(
                "Plugin host sidecar binary not found. Set {PLUGIN_HOST_ENV} or place plugin-host under {}.",
                self.app_data_dir.join("sidecars").display()
            ));
            return inner.status.clone();
        };

        let port = match allocate_local_port() {
            Ok(port) => port,
            Err(error) => {
                inner.child = None;
                inner.status = PluginHostSidecarStatus::degraded(error);
                return inner.status.clone();
            }
        };

        let launch = build_plugin_host_launch(&self.app_data_dir, executable, port);
        inner.status = PluginHostSidecarStatus::booting(
            launch.endpoint.clone(),
            launch.executable.to_string_lossy().to_string(),
        );

        match spawn_plugin_host_sidecar(&launch) {
            Ok(mut child) => match probe_plugin_host_health(&launch.host, launch.port, PLUGIN_HOST_HEALTH_TIMEOUT) {
                Ok(()) => {
                    let pid = child.id();
                    inner.child = Some(child);
                    inner.status = PluginHostSidecarStatus::ready(
                        pid,
                        launch.endpoint,
                        launch.executable.to_string_lossy().to_string(),
                    );
                }
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    inner.child = None;
                    inner.status = PluginHostSidecarStatus::degraded(format!(
                        "Plugin host sidecar health check failed at {}: {error}",
                        launch.endpoint
                    ));
                }
            },
            Err(error) => {
                inner.child = None;
                inner.status = PluginHostSidecarStatus::degraded(error);
            }
        }

        inner.status.clone()
    }

    pub fn stop_blocking(&self) -> PluginHostSidecarStatus {
        let mut inner = self.inner.lock().unwrap();
        if let Some(mut child) = inner.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        inner.status = PluginHostSidecarStatus::stopped();
        inner.status.clone()
    }

    pub fn status_blocking(&self) -> PluginHostSidecarStatus {
        let mut inner = self.inner.lock().unwrap();
        inner.refresh_child_status();
        inner.status.clone()
    }
}

impl PluginHostSidecarControllerInner {
    fn refresh_child_status(&mut self) {
        let Some(child) = self.child.as_mut() else {
            if matches!(self.status.state, PluginHostSidecarState::Ready | PluginHostSidecarState::Booting) {
                self.status = PluginHostSidecarStatus::stopped();
            }
            return;
        };

        match child.try_wait() {
            Ok(Some(exit_status)) => {
                self.child = None;
                self.status = PluginHostSidecarStatus::degraded(format!(
                    "Plugin host sidecar exited unexpectedly with status {exit_status}."
                ));
            }
            Ok(None) => {}
            Err(error) => {
                self.child = None;
                self.status = PluginHostSidecarStatus::degraded(format!(
                    "Failed to check plugin host sidecar health: {error}"
                ));
            }
        }
    }
}

impl Drop for PluginHostSidecarController {
    fn drop(&mut self) {
        if let Ok(mut inner) = self.inner.lock() {
            if let Some(mut child) = inner.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}
```

Important implementation details:

- Use `Command::new(&launch.executable)` with `.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())`.
- On health timeout or non-200 response, kill and wait for the spawned child before returning degraded.
- Return missing-binary error text containing `AIRI_PLUGIN_HOST_PATH` and `app_data_dir.join("sidecars")`.
- Use `--test-threads=1` for sidecar tests because existing tests mutate process env vars.

- [ ] **Step 4: Run tests to verify green**

Run: `cargo test --manifest-path apps/stage-tauri/Cargo.toml sidecar -- --test-threads=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/stage-tauri/src/commands/sidecar.rs
git commit -m "feat(stage-tauri): add plugin host sidecar controller"
```

### Task 2: Wire Sidecar Status Into Plugin Commands

**Files:**
- Modify: `apps/stage-tauri/src/main.rs`
- Modify: `apps/stage-tauri/src/commands/plugins.rs`

**Interfaces:**
- Consumes: Task 1 `PluginHostSidecarController` and `PluginHostSidecarStatus`.
- Produces:
  - `electron_plugins_load_enabled(app_handle, state, sidecar)` starts/probes sidecar and updates capability metadata.
  - `electron_plugins_load(app_handle, state, sidecar, name)` starts/probes sidecar and updates plugin + sidecar capability metadata.
  - `electron_plugins_inspect(app_handle, state, sidecar)` includes `"sidecar": <PluginHostSidecarStatus>`.

- [ ] **Step 1: Write failing compile-level command wiring change**

Modify function signatures in `plugins.rs` to require sidecar state and use it in return payloads before `main.rs` manages it. This should fail compile until `main.rs` is updated.

Target signatures:

```rust
pub async fn electron_plugins_load_enabled(
    app_handle: AppHandle,
    state: State<'_, PluginHostState>,
    sidecar: State<'_, crate::commands::sidecar::PluginHostSidecarController>,
) -> Result<PluginRegistrySnapshot, String>

pub async fn electron_plugins_load(
    app_handle: AppHandle,
    state: State<'_, PluginHostState>,
    sidecar: State<'_, crate::commands::sidecar::PluginHostSidecarController>,
    name: Option<String>,
) -> Result<PluginRegistrySnapshot, String>

pub async fn electron_plugins_inspect(
    app_handle: AppHandle,
    state: State<'_, PluginHostState>,
    sidecar: State<'_, crate::commands::sidecar::PluginHostSidecarController>,
) -> Result<Value, String>
```

- [ ] **Step 2: Run compile/test to verify red**

Run: `cargo test --manifest-path apps/stage-tauri/Cargo.toml plugin_host -- --test-threads=1`

Expected: FAIL because the sidecar controller is not yet managed in `main.rs` or helper usage is incomplete.

- [ ] **Step 3: Implement command wiring**

In `apps/stage-tauri/src/main.rs`, manage the sidecar controller during setup:

```rust
let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
app.manage(commands::godot::GodotStageController::new(app_data_dir.clone()));
app.manage(commands::sidecar::PluginHostSidecarController::new(app_data_dir));
```

In `apps/stage-tauri/src/commands/plugins.rs`, add a helper:

```rust
fn update_sidecar_capability(
    state: &PluginHostState,
    status: &crate::commands::sidecar::PluginHostSidecarStatus,
) {
    state.update_capability(
        "plugin-host:sidecar".to_string(),
        status.state.as_str().to_string(),
        Some(serde_json::json!({
            "pid": status.pid,
            "endpoint": status.endpoint,
            "executablePath": status.executable_path,
            "lastError": status.last_error,
            "updatedAt": status.updated_at,
        })),
        now_millis(),
    );
}
```

Then:

- `electron_plugins_load_enabled` calls `let sidecar_status = sidecar.start_blocking(); update_sidecar_capability(&state, &sidecar_status);`.
- `electron_plugins_load` validates `name`, calls `sidecar.start_blocking()`, updates `plugin-host:sidecar`, then updates `plugin-host:plugin:{name}` with state `ready` if sidecar is ready, otherwise `degraded`.
- `electron_plugins_inspect` calls `let sidecar_status = sidecar.status_blocking(); update_sidecar_capability(&state, &sidecar_status);` and includes `"sidecar": sidecar_status` in the JSON object.

- [ ] **Step 4: Run tests to verify green**

Run: `cargo test --manifest-path apps/stage-tauri/Cargo.toml plugin_host -- --test-threads=1`

Expected: PASS.

Run: `cargo test --manifest-path apps/stage-tauri/Cargo.toml sidecar -- --test-threads=1`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/stage-tauri/src/main.rs apps/stage-tauri/src/commands/plugins.rs
git commit -m "feat(stage-tauri): report plugin host sidecar status"
```

### Task 3: SDK Node WebSocket Runtime

**Files:**
- Create: `packages/plugin-sdk/src/plugin-host/runtimes/node/index.test.ts`
- Modify: `packages/plugin-sdk/src/plugin-host/runtimes/node/index.ts`

**Interfaces:**
- Consumes: `PluginTransport` union with `{ kind: "websocket"; url: string; protocols?: string[] }`.
- Produces: `createPluginContext({ kind: "websocket", url, protocols })` returns `createWebSocketHostChannel(new WebSocket(url, protocols))`.

- [ ] **Step 1: Write failing Vitest tests**

Create `packages/plugin-sdk/src/plugin-host/runtimes/node/index.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

const createWebSocketHostChannel = vi.fn((socket: unknown) => ({ socket }))

vi.mock('../../../channels/remote/websocket', () => ({
  createWebSocketHostChannel,
}))

describe('node plugin-host runtime createPluginContext', () => {
  const originalWebSocket = globalThis.WebSocket

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      value: originalWebSocket,
      writable: true,
    })
    createWebSocketHostChannel.mockClear()
  })

  it('creates a websocket-backed host channel with url and protocols', async () => {
    const constructed: Array<{ protocols?: string[], url: string }> = []
    class FakeWebSocket {
      constructor(url: string, protocols?: string[]) {
        constructed.push({ url, protocols })
      }
    }
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      value: FakeWebSocket,
      writable: true,
    })

    const { createPluginContext } = await import('./index')
    const context = createPluginContext({
      kind: 'websocket',
      protocols: ['airi.plugin.v1'],
      url: 'ws://127.0.0.1:49152/ws',
    })

    expect(constructed).toEqual([
      { url: 'ws://127.0.0.1:49152/ws', protocols: ['airi.plugin.v1'] },
    ])
    expect(createWebSocketHostChannel).toHaveBeenCalledTimes(1)
    expect(context).toEqual({ socket: expect.any(FakeWebSocket) })
  })

  it('throws a deterministic error when global WebSocket is unavailable', async () => {
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      value: undefined,
      writable: true,
    })

    const { createPluginContext } = await import('./index')

    expect(() =>
      createPluginContext({
        kind: 'websocket',
        url: 'ws://127.0.0.1:49152/ws',
      }),
    ).toThrow('Node runtime WebSocket transport requires globalThis.WebSocket')
  })
})
```

- [ ] **Step 2: Run tests to verify red**

Run: `pnpm -F @proj-airi/plugin-sdk exec vitest run src/plugin-host/runtimes/node/index.test.ts`

Expected: FAIL with `WebSocket transport is not implemented for node runtime yet.`

- [ ] **Step 3: Implement WebSocket branch**

Update `packages/plugin-sdk/src/plugin-host/runtimes/node/index.ts`:

```ts
import type { ChannelHost } from '../../../channels/shared'
import type { PluginTransport } from '../../transports'

import { createContext as createInMemoryContext } from '@moeru/eventa'

import { createWebSocketHostChannel } from '../../../channels/remote/websocket'

function createNodeWebSocket(url: string, protocols?: string[]): WebSocket {
  const WebSocketConstructor = globalThis.WebSocket

  if (typeof WebSocketConstructor !== 'function') {
    throw new Error('Node runtime WebSocket transport requires globalThis.WebSocket. Use Node 22+ or install a WebSocket polyfill before creating the plugin context.')
  }

  return protocols && protocols.length > 0
    ? new WebSocketConstructor(url, protocols)
    : new WebSocketConstructor(url)
}

export function createPluginContext(transport: PluginTransport): ChannelHost {
  switch (transport.kind) {
    case 'in-memory':
      return createInMemoryContext()
    case 'websocket':
      return createWebSocketHostChannel(createNodeWebSocket(transport.url, transport.protocols))
    case 'node-worker':
      throw new Error('Node worker transport is not implemented yet.')
    case 'electron':
      throw new Error('Electron transport is not implemented yet.')
    case 'web-worker':
      throw new Error('Web worker transport is not available in node runtime.')
    default:
      throw new Error('Unknown plugin transport kind.')
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm -F @proj-airi/plugin-sdk exec vitest run src/plugin-host/runtimes/node/index.test.ts`

Expected: PASS.

Run: `pnpm -F @proj-airi/plugin-sdk typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-sdk/src/plugin-host/runtimes/node/index.ts packages/plugin-sdk/src/plugin-host/runtimes/node/index.test.ts
git commit -m "feat(plugin-sdk): support node websocket plugin contexts"
```

### Task 4: Final Verification

**Files:**
- No new source files expected beyond previous tasks.

**Interfaces:**
- Consumes all task outputs.
- Produces verified feature branch ready for review.

- [ ] **Step 1: Run Rust targeted tests**

Run: `cargo test --manifest-path apps/stage-tauri/Cargo.toml sidecar -- --test-threads=1`

Expected: PASS.

Run: `cargo test --manifest-path apps/stage-tauri/Cargo.toml plugin_host -- --test-threads=1`

Expected: PASS.

- [ ] **Step 2: Run SDK tests**

Run: `pnpm -F @proj-airi/plugin-sdk exec vitest run src/plugin-host/runtimes/node/index.test.ts`

Expected: PASS.

Run: `pnpm -F @proj-airi/plugin-sdk typecheck`

Expected: PASS.

- [ ] **Step 3: Inspect diff**

Run: `git diff --stat anima/main...HEAD`

Expected: only the design/plan docs plus sidecar/plugin command/SDK runtime files changed.

- [ ] **Step 4: Confirm commits**

Run: `git log --oneline --decorate -6`

Expected: the branch contains the design commit, the plan commit, and one implementation commit per completed task.
