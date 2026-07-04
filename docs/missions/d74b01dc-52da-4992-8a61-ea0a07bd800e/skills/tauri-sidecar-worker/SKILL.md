---
name: tauri-sidecar-worker
description: Ports Electron main-process sidecar subsystems (Godot stage bridge, channel server with self-signed mTLS, MCP stdio bridge, plugin-host Node sidecar, and system tray) from `apps/stage-tamagotchi/src/main/` to the Tauri Rust backend under `apps/stage-tauri/`, using `tauri-plugin-shell` for `externalBin` bundling, `tauri::async_runtime` for HTTP/WS servers, `rcgen` for certificate generation, and `pkg`-compiled Node binaries for the plugin host.
---

# Tauri Sidecar Worker

## Scope

Port a single Electron main-process sidecar subsystem (or a tightly-coupled group) to the Tauri Rust backend. One subsystem per work unit. Never bundle unrelated subsystems into a single step.

Source roots (Electron main):
- `apps/stage-tamagotchi/src/main/services/airi/godot-stage/index.ts`
- `apps/stage-tamagotchi/src/main/services/airi/channel-server/index.ts`
- `apps/stage-tamagotchi/src/main/services/airi/mcp-servers/index.ts`
- `apps/stage-tamagotchi/src/main/tray/index.ts`
- `packages/plugin-sdk/src/plugin-host/` (Node runtime — consumed unchanged by the `pkg`-compiled sidecar)
- `packages/plugin-sdk-tamagotchi/package.json` (pkg config target)

Target roots (Tauri):
- `apps/stage-tauri/src-tauri/tauri.conf.json` (bundle + externalBin)
- `apps/stage-tauri/src-tauri/src/sidecars/` (Rust modules: `godot.rs`, `channel_server.rs`, `mcp.rs`, `plugin_host.rs`, `tray.rs`)
- `apps/stage-tauri/sidecars/` (binaries placed by the build pipeline: `godot-stage`, `plugin-host`)
- `packages/plugin-sdk-tamagotchi/package.json` (pkg config + `build:sidecar` script)
- `packages/plugin-sdk-tamagotchi/pkg.entry.json` (pkg entry + assets declaration)

Shared contract types that MUST remain stable (do NOT rename or restructure):
- `apps/stage-tamagotchi/src/shared/eventa/index.ts` — the eventa contract names (`electron:godot-stage:*`, `electron:server-channel:*`, `electron:mcp:*`, tray labels under `tamagotchi.electron.tray.menu.labels.*`).
- `packages/stage-shared/src/godot-stage.ts`, `packages/stage-shared/src/server-channel-qr.ts`, `apps/stage-tamagotchi/src/shared/mcp-config.ts`.

The Rust side implements `tauri::command` handlers that satisfy these contracts by name. Renderer code is unchanged.

## Background

### What a "sidecar" means in the Tauri port

There are three categories:

1. **`externalBin` sidecar** — a pre-built binary bundled into the app and spawned by Rust via `tauri-plugin-shell`'s `Command::new_sidecar(<name>)`. Tauri appends the `-${TARGET_TRIPLE}` suffix at bundle time and copies the binary into the app's `resources/` directory. Two binaries qualify:
   - `godot-stage` — the Godot 4 export template, currently shipped under `apps/stage-tamagotchi/extraResources/godot-stage/...`. Move to `apps/stage-tauri/sidecars/godot-stage` and declare in `bundle.externalBin`.
   - `plugin-host` — a `pkg`-compiled single binary produced from `packages/plugin-sdk/src/plugin-host/index.ts`. Declared in `bundle.externalBin`; output to `apps/stage-tauri/sidecars/plugin-host`.

2. **Managed (in-process) sidecar** — a Rust `axum`/`tokio-tungstenite` server running inside the Tauri process as a `tauri::async_runtime::spawn` task. These are NOT `externalBin`:
   - `channel-server` — HTTP/WS server with self-signed mTLS, port `6121` by default (or `SERVER_CHANNEL_PORT` env).
   - `mcp` — the MCP manager. In Tauri the MCP manager stays in Node inside the `plugin-host` sidecar (it already imports `@modelcontextprotocol/sdk` and spawns `StdioClientTransport` children). Rust only proxies renderer requests to the Node sidecar over WebSocket.

3. **Native Tauri integration** — no separate process, just Rust APIs:
   - `tray` — `tauri::SystemTray` + `tauri::menu::MenuItem`.
   - Random-port allocation for the Godot bridge WebSocket — `std::net::TcpListener::bind("127.0.0.1:0")` + `local_addr()?.port()`.

### Sidecar spawn/IPC pattern

The Electron Godot manager spawns the Godot binary, opens a localhost WebSocket on a random port, and passes the `ws://127.0.0.1:<port>/ws?token=<token>` URL plus the storage root via `--`-separated args. Tauri keeps this exact protocol — only the spawn primitive changes:

```rust
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::Command;

let sidecar = app.shell().sidecar("godot-stage")
    .map_err(|e| e.to_string())?
    .args([
        "--",
        &format!("--airi-ws-url={ws_url}"),
        &format!("--airi-storage-root={storage_root}"),
    ]);
```

The `ws_url` and `storage_root` are computed in Rust before spawning. The token is a `Uuid::new_v4()` hex string.

### Required eventa contracts (preserved verbatim)

| Contract name | Direction | Notes |
|---|---|---|
| `eventa:invoke:electron:godot-stage:start` | renderer → Rust | Returns `ElectronGodotStageStatus` |
| `eventa:invoke:electron:godot-stage:stop` | renderer → Rust | Returns `ElectronGodotStageStatus` |
| `eventa:invoke:electron:godot-stage:get-status` | renderer → Rust | Returns `ElectronGodotStageStatus` |
| `eventa:invoke:electron:godot-stage:apply-scene-input` | renderer → Rust | Materializes model bytes, forwards path |
| `eventa:invoke:electron:godot-stage:get-view-snapshot` | renderer → Rust | Returns cached snapshot or null |
| `eventa:invoke:electron:godot-stage:apply-view-patch` | renderer → Rust | Forward patch over WS |
| `eventa:invoke:electron:godot-stage:request-view-snapshot` | renderer → Rust | Forward request over WS |
| `eventa:event:electron:godot-stage:status-changed` | Rust → renderer | Emit on state transitions |
| `eventa:event:electron:godot-stage:view-snapshot-changed` | Rust → renderer | Emit on snapshot |
| `eventa:event:electron:godot-stage:view-state-error` | Rust → renderer | Emit on parse error |
| `eventa:invoke:electron:server-channel:get-config` | renderer → Rust | |
| `eventa:invoke:electron:server-channel:apply-config` | renderer → Rust | Restart server on TLS/hostname/token change |
| `eventa:invoke:electron:server-channel:get-qr-payload` | renderer → Rust | Uses `createServerChannelQrPayload` shape |
| `eventa:invoke:electron:mcp:apply-and-restart` | renderer → Rust | Forwarded to Node sidecar |
| `eventa:invoke:electron:mcp:list-tools` | renderer → Rust | Forwarded to Node sidecar |
| `eventa:invoke:electron:mcp:call-tool` | renderer → Rust | Forwarded to Node sidecar |
| `eventa:invoke:electron:mcp:get-runtime-status` | renderer → Rust | Forwarded to Node sidecar |
| `eventa:invoke:electron:mcp:open-config-file` | renderer → Rust | Opens `mcp.json` via OS opener |
| `eventa:invoke:electron:mcp:read-config-text` | renderer → Rust | Reads `mcp.json` |
| `eventa:invoke:electron:mcp:write-config-text` | renderer → Rust | Writes `mcp.json` |
| `eventa:invoke:electron:mcp:test-server` | renderer → Rust | Forwarded to Node sidecar |

## Required Skills

- `using-superpowers` — establish skill discovery before any other action.
- `verification-before-completion` — run verification commands and confirm output before claiming a subsystem is ported.
- `test-driven-development` — when a Rust module has companion tests, reproduce behavior before editing production code.
- `systematic-debugging` — when a sidecar fails to spawn or the WebSocket handshake hangs.

## Required Tools

Workers MUST use the MCP tools listed in `AGENTS.md` for all code lookup and edits. Native tools (`Read`, `Edit`, `Grep`, `Glob`, `Create`) are emergency fallback only and must be logged inline as `// FALLBACK: MCP <tool> failed with <error>; using native <tool> for <path>`.

### Opening move (before any subsystem work)

1. `serena___list_memories()` — list recorded memories; auto-read any whose `memory_name` overlaps tokens in the current subsystem task (godot, channel-server, mcp, plugin-host, tray, sidecar, sidecar-worker).
2. `serena___activate_project("/home/vi/anima")`.
3. `jcodemunch___resolve_repo("/home/vi/anima")` — assert repo id is `"airi"`.
4. `jcodemunch___assemble_task_context(repo="airi", task="Port <subsystem name> sidecar from Electron main to Tauri Rust")` for auto-classification and anchor extraction.

### Locate target symbols

- `jcodemunch___get_file(repo="airi", file_path="apps/stage-tamagotchi/src/main/services/airi/godot-stage/index.ts")` — authoritative Electron source body.
- `jcodemunch___get_outline(repo="airi", file_path="apps/stage-tamagotchi/src/main/services/airi/channel-server/index.ts")` — outline for porting surface planning.
- `serena___get_symbols_overview(relative_path="apps/stage-tamagotchi/src/main/services/airi/mcp-servers/index.ts")` — Node-side MCP manager.
- `serena___find_symbol(name_path_pattern="createGodotStageManager", include_body=true)` — exact symbol source.

### Understand impact

- `jcodemunch___get_blast_radius(repo="airi", symbol="<symbol_id>", depth=2, include_source=true)` — confirm no dangling Electron references remain after a port.
- `jcodemunch___get_call_hierarchy(repo="airi", symbol_id="<symbol_id>", direction="both", depth=3)` — confirm callers and callees are intact (especially the renderer stores in `packages/stage-ui/stores/` and `apps/stage-tamagotchi/src/renderer/`).
- `jcodemunch___find_references(repo="airi", mode="importers", file_path="apps/stage-tamagotchi/src/shared/eventa/index.ts")` — confirm the eventa contract importers still resolve.
- `jcodemunch___get_dependency_graph(repo="airi", file="<target file>", direction="both", depth=2)` — confirm import graph is consistent.

### Apply edit

- `serena___replace_symbol_body(name_path="<qualified name>", relative_path="<target Rust or json file>", body="<new body>")` — replace a single symbol body (Rust functions are also symbols once `rust-analyzer` LSP is online).
- `serena___replace_content(relative_path="<target file>", needle="<pattern>", repl="<replacement>", mode="literal" | "regex")` — replace JSON snippets, Cargo.toml deps, config keys.
- `serena___replace_in_files(needle="<pattern>", repl="<replacement>", mode="literal" | "regex", relative_path="<target file or dir>")` — bulk replace across sidecar-related files when a contract name or path moves.
- `serena___insert_after_symbol` / `serena___insert_before_symbol` — insert new helpers/commands around existing Rust functions.
- `serena___safe_delete_symbol` — remove dead Electron-only symbols after confirming no references.

### Verify and reindex

- `jcodemunch___get_unit(repo="airi", unit_id="<id>", verify=true, verify_against="cache")` — confirm source actually changed.
- `jcodemunch___register_edit(repo="airi", file_paths=["<target file>"], reindex=true)` — invalidate cache.
- `serena___get_diagnostics_for_file(relative_path="<target Rust file>", min_severity=2)` — confirm no new warnings/errors (`rust-analyzer` diagnostics).
- `cargo check --manifest-path apps/stage-tauri/src-tauri/Cargo.toml` — Rust typecheck for the Tauri crate.
- `pnpm -F @proj-airi/plugin-sdk-tamagotchi typecheck` — typecheck Node sidecar config.
- `pnpm -F @proj-airi/plugin-sdk-tamagotchi exec vitest run` — run plugin-host tests (unchanged).
- `pnpm -F @proj-airi/plugin-sdk-tamagotchi build:sidecar` — verify the pkg-compiled binary is produced (Task 6 below).

Manual:
- `cargo tauri dev` — launch the app; observe sidecar spawn logs in the Tauri console.

## Work Procedure

Execute each subsystem port as a discrete work unit. Do not start the next subsystem until verification passes for the current one.

### Step 0 — Read the contract

Re-read the relevant sections of `AGENTS.md` (Tool Binding Table, Delegated Code-Change Loop), `architecture.md` (Sidecar / IPC layer), and `library/tauri-port-migration-guide.md` (Sidecar Bundling, HTTP/WS Server in Rust, Certificate Generation) before touching any file.

### Step 1 — Confirm the source symbols and plan the Rust target

- Use `jcodemunch___get_file` to fetch the authoritative TypeScript source for the subsystem being ported.
- Map every public method (`start`, `stop`, `getStatus`, `applySceneInput`, `getRequestViewSnapshot`, …) to a `tauri::command` handler in Rust. The command names should match the eventa contract suffix (e.g., `electron:godot-stage:start` → `#[tauri::command] fn godot_stage_start(...)`).
- Decide where the Rust state lives: a `tauri::State<Mutex<GodotStageState>>` (or `tokio::sync::Mutex` when holding `.await`) managed by `app.manage(state)`.

### Step 2 — Apply the porting patterns

Apply patterns in order. One substitution per step; never bundle unrelated edits. Every change must be backed by a feature commit.

#### Task 1 — Godot sidecar bundling and Rust spawn

Pattern 1-A — Move the Godot binary into the sidecar slot:

- Source locations to consolidate from (dev):
  - `apps/stage-tamagotchi/extraResources/godot-stage/godot-stage` (Linux)
  - `apps/stage-tamagotchi/extraResources/godot-stage/godot-stage.exe` (Windows)
  - `apps/stage-tamagotchi/extraResources/godot-stage/godot-stage.app/Contents/MacOS/godot-stage` (macOS)
- Target (one binary per triple, Tauri appends the `-${TARGET_TRIPLE}` suffix): `apps/stage-tauri/sidecars/godot-stage-${TARGET_TRIPLE}`.
- Do NOT delete the Electron copy until the Tauri windows are verified working (mission off-limits rule).

Pattern 1-B — Declare in `tauri.conf.json`:

```json
{
  "bundle": {
    "externalBin": [
      "sidecars/godot-stage"
    ]
  }
}
```

Pattern 1-C — Rust spawn + WebSocket bridge (port from `godot-stage/index.ts`):

- Random port: obtain via `std::net::TcpListener::bind("127.0.0.1:0")?; let port = listener.local_addr()?.port();`. Then drop the listener so `tokio` can rebind the same port (the OS keeps it in `TIME_WAIT` only briefly; on conflict, retry with a new listener — wrap in a small loop).
- Spawn via `app.shell().sidecar("godot-stage").args([...])`.
- The `ws_url` is `ws://127.0.0.1:{port}/ws?token={token}` where `token = Uuid::new_v4().simple().to_string()`.
- The storage root is `app.path().app_data_dir()?.join("godot-stage")` (writeable dir; create with `tokio::fs::create_dir_all`).
- The bridge server uses `tokio::net::TcpListener` + `tokio_tungstenite::accept_async`. One peer is held at a time (mirrors the Electron singleton peer).
- Forward inbound `stage.ready` / `stage.fatal` / `scene.applied` / `scene.error` / `stage.view.snapshot` / `stage.view.error` envelopes by parsing the JSON with `serde_json::Value` and emitting the matching Tauri events listed in the contract table above.
- Forward outbound `host.scene.apply`, `host.view.patch`, `host.view.request_snapshot`, `host.shutdown` via `peer.send(Message::Text(payload))`.
- Lifecycle:
  - `start` → mutex-guarded, status transitions `stopped → starting → running | error` (mirrors `setStatus`).
  - `stop` → send `host.shutdown`, wait 2s for exit, then `kill()`; status → `stopped`.
  - `apply_scene_input` → materialize model bytes under `<storage_root>/models/<modelId>/<normalizedFileName>` and send `host.scene.apply`.
- Spawn logs pipe to the Tauri log facade (`log::info!` / `log::warn!`) — `process_handle.stdout.on_event`/`stderr.on_event` via `tauri-plugin-shell` events.

Pattern 1-D — Dev mode fallback:

- In dev, if `GODOT4` env var is set, spawn the engine binary with `--path <project.godot dir>` plus the sidecar args (mirrors `resolveGodotBinary`). Locate `engines/stage-tamagotchi-godot/project.godot` by walking parent directories from the app's CWD.
- If `GODOT4` is unset and the sidecar binary does not exist, return `Err("GODOT4 is required...")` — do not silently fall back.

#### Task 2 — Channel server (mTLS, axum, rcgen)

Pattern 2-A — Port the server:

- Use `axum` (the Node `h3` framework has no Rust equivalent; `axum` is the migration-guide-recommended alternative). The existing `@proj-airi/server-runtime` package is "kept" but only its message-level protocol survives — the actual HTTP/WS server is implemented in Rust.
- Bind to `127.0.0.1` by default. The configured `hostname` may switch the bind to `0.0.0.0` (mirrors `getServerChannelPort` + `getServerRuntimeBaseOptions`).
- WS upgrade handler mirrors `defineWebSocketHandler`: accept only peers presenting the configured authToken (query-string or header).
- Auth: token via query string `?authToken=<value>` or `Authorization: Bearer <value>` header. Reject with 401 otherwise (mirrors the existing `auth.token` behavior).

Pattern 2-B — Self-signed certs with `rcgen`:

- Root CA: `CertificateParams` with `DistinguishedName` (`CN=AIRI`, `O=AIRI`, `C=US`, `L=Local`), `validity = 10 * 365 days`, `PKCS_ECDSA_P256_SHA256` (preferred over RSA 2048 — smaller, faster).
- Leaf: signed by the CA, SANs = `["localhost", "127.0.0.1", "::1", <hostname>, ...local_ips]`. Mirror `getCertificateDomains()` (uses `getLocalIPs()` from `@proj-airi/server-runtime`). Compute local IPs in Rust by enumerating non-loopback IPv4 addresses on interfaces (use the `if-addrs` or `nix` crate).
- 10-year validity for the leaf too.
- PEM files written under `app_handle.path().app_data_dir()?`:
  - `websocket-ca-cert.pem`, `websocket-ca-key.pem`
  - `websocket-cert.pem`, `websocket-key.pem`
- Reuse existing leaf when its SANs cover all current domains (mirror `certHasAllDomains`). Otherwise regenerate. Always serve `cert.pem` chained with `ca-cert.pem` (mirror `withCertificateChain`).
- Use `tokio_rustls` for the TLS listener. `rustls::ServerConfig` built from the leaf cert + key.

Pattern 2-C — Platform CA store install:

- macOS: `Command::new("security").args(["add-trusted-cert", "-d", "-r", "trustRoot", "-k", "<login keychain path>", "<ca cert path>"]).status()`.
- Windows: `Command::new("certutil").args(["-addstore", "-f", "Root", "<ca cert path>"]).status()`.
- Linux (Debian-based): copy PEM to `/usr/local/share/ca-certificates/airi-websocket-ca.crt` and run `update-ca-certificates`.
- Linux (Fedora/RHEL): copy to `/etc/pki/ca-trust/source/anchors/` then `update-ca-trust`. Detect distro by checking which command exists (`which update-ca-certificates` vs `update-ca-trust`).
- All shell paths must be escaped; don't pass user-controlled strings to the shell. Use the `std::process::Command` array form (no shell interpolation).
- Failures here MUST NOT crash the server — log a warning and continue (matches the Electron behavior of catching `installCACertificate` errors).

Pattern 2-D — QR code generation:

- Build the same payload shape as `createServerChannelQrPayload` (`{ type: 'airi:server-channel', version: 1, urls, authToken }`).
- Generate QR via the `qrcode` crate (`qrcode::QrCode::new(payload_string).unwrap().render::<unicode>().min_dimensions(...).build()` returns a string). Return the SVG/PNG bytes from the `server_channel_get_qr_payload` command; the renderer renders the QR image. Alternatively, render an SVG string in Rust and return it; the renderer injects it via `v-html` (verify with the renderer-migration worker if the contract changes).
- Prefer the npm `qrcode` package route if the renderer already imports it — confirm via `jcodemunch___search_text(repo="airi", query="qrcode")` before deciding. If the renderer already renders the QR, Rust only needs to return the payload string and the QR stays frontend-side.

Pattern 2-E — Config persistence:

- Reuse `tauri-plugin-store` for `server-channel/config.json` instead of the Electron `createConfig` helper. Default hostname `127.0.0.1`, default authToken `""` (Server runtime auto-generates a UUID on first start when empty — mirror `ensureServerChannelConfigDefaults(config, randomUUID)`).
- On `apply-server-channel`, if TLS host or token changed, restart the server (mirror `runtimeChanged` branch). Otherwise just ensure `start()`.

#### Task 3 — MCP stdio bridge

Pattern 3-A — Keep MCP in the Node sidecar, proxy from Rust:

- The MCP manager in the Electron app (`mcp-servers/index.ts`) imports `@modelcontextprotocol/sdk` and spawns `StdioClientTransport` children. Tauri Rust has no equivalent Node MCP SDK and rewriting it in Rust is out of scope.
- The plugin-host Node sidecar (Task 4) already runs the plugin host runtime in a Node process. Add the MCP manager to the same sidecar — both share the `@modelcontextprotocol/sdk` dependency and the same WebSocket IPC channel.
- The sidecar listens on a random localhost port chosen at Tauri startup (via `std::net::TcpListener::bind("127.0.0.1:0")`) and passed to the sidecar binary as the first positional argument: `Command::new_sidecar("plugin-host").args([port.to_string()])`.

Pattern 3-B — Rust command proxy:

- `#[tauri::command] async fn mcp_list_tools(...)` → open a WebSocket to `ws://127.0.0.1:<port>?type=mcp`, send `{ op: "list_tools" }`, await the JSON response, return to the renderer.
- Same for `mcp_call_tool`, `mcp_apply_and_restart`, `mcp_get_runtime_status`, `mcp_test_server`.
- `mcp_open_config_file`, `mcp_read_config_text`, `mcp_write_config_text` stay in Rust — they only read/write `<app_data_dir>/mcp.json` and shell-open it. Mirror the Electron file paths exactly.

Pattern 3-C — Config file:

- Path: `app.path().app_data_dir()?.join("mcp.json")` (Electron uses `app.getPath('userData') + '/mcp.json'`).
- Default content: `{ "mcpServers": {} }`.
- Parsing/validation: the renderer already validates via `parseElectronMcpConfigText` (`apps/stage-tamagotchi/src/shared/mcp-config.ts`). The Rust side does a light `serde_json::Value` parse; schema validation stays renderer-side.

#### Task 4 — Plugin-host Node sidecar (pkg)

Pattern 4-A — Package entry + config:

- Add `@vercel/pkg` as a devDependency of `packages/plugin-sdk-tamagotchi/`. Verify with `jcodemunch___search_text(repo="airi", query="@vercel/pkg")` first that it is not already present (the binding rule: never add a dependency without searching for existing internal implementations).
- Add a `pkg` section to `packages/plugin-sdk-tamagotchi/package.json`:

```json
{
  "pkg": {
    "scripts": ["dist/plugin-host.entry.mjs"],
    "assets": [
      "node_modules/@modelcontextprotocol/sdk/**/*",
      "node_modules/@moeru/eventa/**/*"
    ],
    "targets": [
      "node18-linux-x64",
      "node18-macos-x64",
      "node18-win-x64"
    ],
    "outputPath": "dist-sidecar"
  }
}
```

- Add a `build:sidecar` script to `package.json`: `"build:sidecar": "pnpm build && pkg dist/plugin-host.entry.mjs --config package.json -o ../../apps/stage-tauri/sidecars/plugin-host"`. Adjust the relative path once the actual workspace layout is verified.
- Verify the path with `jcodemunch___get_dependency_graph(repo="airi", file="packages/plugin-sdk-tamagotchi/package.json", direction="imports", depth=1)` before locking the output path.

Pattern 4-B — Entry point:

- Create `packages/plugin-sdk-tamagotchi/src/plugin-host.entry.ts` (or `packages/plugin-sdk/src/plugin-host/entry.ts`) that:
  - Reads the localhost port from `process.argv[2]`.
  - Calls `createPluginContext({ kind: 'websocket', port })` — this requires implementing the WebSocket transport in `packages/plugin-sdk/src/plugin-host/runtimes/node/index.ts` (currently throws `"WebSocket transport is not implemented for node runtime yet."`).
  - Bootstraps the MCP manager alongside the plugin host within the same process.
- The WebSocket transport is a Node-sidecar concern: the sidecar listens, Tauri connects. The transport must serialize the same eventa message envelopes the in-memory transport already uses (`{ event, payload }` frames). Use the existing `@moeru/eventa` plumbing — the only new code is the WebSocket `ChannelHost` impl.

Pattern 4-C — Manifest assets:

- Confirm via `jcodemunch___search_text(repo="airi", query="plugin-manifest", file_pattern="packages/plugin-sdk/**")` what the runtime reads at startup. Include those JSON files in `pkg.assets`.
- Confirm the `node_modules` paths that `pkg` needs to bundle (anything `require`d at runtime, not pre-bundled by `tsdown`). Add to `pkg.assets`.

Pattern 4-D — Output to the sidecar slot:

- The build outputs `plugin-host-${TARGET_TRIPLE}` for each target triple. Place at `apps/stage-tauri/sidecars/plugin-host-${TARGET_TRIPLE}`.
- Add `"sidecars/plugin-host"` to `bundle.externalBin` in `tauri.conf.json`.

#### Task 5 — Tray

Pattern 5-A — Port to `tauri::SystemTray`:

- Use `tauri::SystemTray`, `tauri::SystemTrayMenu`, `tauri::menu::MenuItem`, `tauri::menu::CheckMenuItem`.
- Menu items: Show, Settings, About, Caption (toggle), Quit — plus the existing submenu structure (Adjust Sizes → Recommended / Full Height / Half Height / Full Screen; Align To → Center / Top-Left / Top-Right / Bottom-Left / Bottom-Right; Caption Overlay → Follow Window (check) / Reset Position). See `apps/stage-tamagotchi/src/main/tray/index.ts` for the full tree.
- The Tauri tray supports a subset of menu primitives — checkbox items use `tauri::menu::CheckMenuItem`. The `click` callback receives the new state.
- Reuse the renderer for window bounds/positioning logic — the Rust side just dispatches events like `tray:show`, `tray:settings`, `tray:caption-toggle`, `tray:align`, `tray:resize` to a window, and the renderer computes the actual geometry (mirrors the existing `applyWindowSize`/`alignWindow` logic which is already webview-driven). Confirm with `jcodemunch___search_units(repo="airi", query="applyWindowSize")` whether to keep the logic in main or push it to the renderer.

Pattern 5-B — i18n reactive rebuild:

- Electron uses `@intlify/core` `LocaleDetector` + `alien-signals` `effect` to rebuild the menu when the locale changes.
- Tauri uses the `sys-locale` crate (or `unic-locale`) to detect the OS locale, plus a Rust-side locale store (e.g., a `tauri::State<Mutex<String>>` updated when the renderer sends a `locale:changed` event).
- Menu labels are fetched from the existing `tamagotchi.electron.tray.menu.labels.*` keys. The Rust side loads the locale strings from the same i18n resource extract (`packages/i18n/locales/<locale>.json`). Use `serde_json` to load the relevant subtree at startup and on locale change.
- Rebuild the menu (re-create `SystemTrayMenu`) whenever the locale changes; reassign with `app.tray().set_menu(new_menu)` (or the v2 equivalent).

Pattern 5-C — macOS template icon:

- Use `tauri::image::Image` from the bundled `resources/tray-icon-macos.png`. Call `set_template_image(true)` on macOS only. Linux/Windows use the regular app icon resized to 16x16 (mirrors the existing `nativeImage.createFromPath(...).resize({ width: 16 })` then `setTemplateImage(isMacOS)`).
- The tray icon assets live at `apps/stage-tamagotchi/resources/tray-icon-macos.png` and `apps/stage-tamagotchi/resources/icon.png`. Copy (or symlink) into `apps/stage-tauri/src-tauri/icons/` and reference by relative path in `tauri.conf.json > trayIcon` (or build the tray image programmatically in `setup`).

Pattern 5-D — Click handlers:

- Click (single): toggle main window visibility (mirrors `toggleWindowShow(params.mainWindow)`).
- macOS double-click: same toggle.
- `onAppBeforeQuit` equivalent: `app.on_window_event` / `RunEvent::ExitRequested` — destroy the tray before exit.

#### Task 6 — Verify sidecars build

Pattern 6-A — pkg build:

- `pnpm -F @proj-airi/plugin-sdk-tamagotchi build:sidecar` — must produce `apps/stage-tauri/sidecars/plugin-host-${TARGET_TRIPLE}` for the host triple. Note: cross-target builds (linux → mac/windows) require `pkg`'s `--target` flag and may need downloaded Node binaries — out of scope for local dev. Verify the host triple build only.
- If `pkg` fails on Node 18 targets because the base Node snapshot is missing, download via `pkg-fetch` (a `pkg` dependency) — `npx pkg-fetch <node18>` auto-runs on first `pkg` invocation.

Pattern 6-B — Tauri check + dev:

- `cargo check --manifest-path apps/stage-tauri/src-tauri/Cargo.toml` — Rust typecheck for the Tauri crate. Output must end with `Finished`.
- `cargo tauri dev` — launches the Rust process and the vite dev server on port 1420. The main window must appear within 30s. Validate per `VAL-TAURI-SYS-002`.
- For sidecar-specific assertions, see `VAL-TAURI-SRV-001` (channel server health check), `VAL-TAURI-SRV-003` (plugin host sidecar), `VAL-TAURI-SRV-004` (Godot sidecar), `VAL-TAURI-SRV-005` (MCP server list).
- Note: Godot and MCP sidecars only start when their respective binaries/config are available locally. Validators should record `"skipped, binary not available"` per the AGENTS.md rule rather than treat absence as failure.

### Step 3 — Verify the port (mandatory, never skip)

Run the following in order for every ported subsystem:

1. `jcodemunch___get_unit(repo="airi", unit_id="<id>", verify=true, verify_against="cache")` — confirm source actually changed.
2. `jcodemunch___get_blast_radius(repo="airi", symbol="<id>", include_source=true)` — confirm no dangling Electron references remain (especially store + page importers in `packages/stage-ui/stores/`, `apps/stage-tamagotchi/src/renderer/`).
3. `jcodemunch___get_call_hierarchy(repo="airi", symbol_id="<id>", direction="callers")` — confirm callers intact.
4. `jcodemunch___get_call_hierarchy(repo="airi", symbol_id="<id>", direction="callees")` — confirm Node-sidecar callees still resolve (e.g., MCP SDK imports).
5. `jcodemunch___register_edit(repo="airi", file_paths=["<target file>", ...], reindex=true)` — invalidate cache.
6. `serena___get_diagnostics_for_file(relative_path="<target Rust file>", min_severity=2)` — confirm no new warnings/errors. If `rust-analyzer` is offline (Rust toolchain not yet installed by the user), record the skip but still run `cargo check` as the authoritative diagnostic source.
7. `cargo check --manifest-path apps/stage-tauri/src-tauri/Cargo.toml` — Rust typecheck.
8. For Node-sidecar changes: `pnpm -F @proj-airi/plugin-sdk-tamagotchi typecheck` and `pnpm -F @proj-airi/plugin-sdk-tamagotchi exec vitest run`.
9. For sidecar build verification: `pnpm -F @proj-airi/plugin-sdk-tamagotchi build:sidecar` and confirm the binary exists.
10. Manual / agent-browser: `cargo tauri dev` then exercise the relevant surface (status page for Godot, settings/connection for QR + channel server, settings/modules/mcp for MCP, tray menu for tray).

If any verification step fails, re-issue the failing substitution with corrective feedback. Do not proceed to the next subsystem until all steps pass.

### Step 4 — Report

Return the structured report described in "When to Return to the Orchestrator" below.

## Components Known to Be Affected

Electron main (porting sources):

- `apps/stage-tamagotchi/src/main/services/airi/godot-stage/index.ts` — Godot sidecar lifecycle + WS bridge.
- `apps/stage-tamagotchi/src/main/services/airi/channel-server/index.ts` — mTLS WS server, cert gen, QR.
- `apps/stage-tamagotchi/src/main/services/airi/channel-server/config.ts` — default config helper.
- `apps/stage-tamagotchi/src/main/services/airi/mcp-servers/index.ts` — MCP stdio manager (stays Node-side; Rust proxies).
- `apps/stage-tamagotchi/src/main/tray/index.ts` — system tray.
- `apps/stage-tamagotchi/src/main/libs/i18n/index.ts` — i18n used by tray.

Node plugin host (consumed by the sidecar; new WebSocket transport):

- `packages/plugin-sdk/src/plugin-host/index.ts` — exports.
- `packages/plugin-sdk/src/plugin-host/core.ts` — plugin machine + IPC.
- `packages/plugin-sdk/src/plugin-host/runtimes/node/index.ts` — runtime factory (needs the `websocket` branch implemented).
- `packages/plugin-sdk/src/plugin-host/transports/` — transport definitions.

Renderer consumers (unchanged, but verify contracts still resolve):

- `packages/stage-ui/stores/mcp-tools.ts`
- `packages/stage-ui/stores/plugin-tools.ts`
- `packages/stage-ui/stores/settings/server-channel.ts`
- `apps/stage-tamagotchi/src/renderer/pages/settings/modules/mcp.vue`
- `apps/stage-tamagotchi/src/renderer/pages/settings/connection/server-channel-qr-card.vue`

Tauri (porting targets):

- `apps/stage-tauri/src-tauri/tauri.conf.json` — `bundle.externalBin`, `trayIcon`.
- `apps/stage-tauri/src-tauri/Cargo.toml` — new crates: `tokio`, `tokio-tungstenite`, `tokio-rustls`, `axum`, `rcgen`, `qrcode`, `sys-locale`, `if-addrs` (or `nix`).
- `apps/stage-tauri/src-tauri/src/sidecars/mod.rs` — module root.
- `apps/stage-tauri/src-tauri/src/sidecars/godot.rs`
- `apps/stage-tauri/src-tauri/src/sidecars/channel_server.rs`
- `apps/stage-tauri/src-tauri/src/sidecars/mcp.rs`
- `apps/stage-tauri/src-tauri/src/sidecars/plugin_host.rs`
- `apps/stage-tauri/src-tauri/src/sidecars/tray.rs`
- `apps/stage-tauri/sidecars/godot-stage-${TARGET_TRIPLE}` — placed binary.
- `apps/stage-tauri/sidecars/plugin-host-${TARGET_TRIPLE}` — pkg output.
- `packages/plugin-sdk-tamagotchi/package.json` — `pkg` config + `build:sidecar` script.

This list is non-exhaustive. When handed a subsystem, classify it against Tasks 1–6 regardless of whether it appears above.

## Example Handoff

The orchestrator hands off a single subsystem port as a JSON object. The worker returns the same shape with `status`, `verifications`, and `notes` filled in.

Request (from orchestrator):

```json
{
  "work_unit_id": "sidecar-port-godot",
  "subsystem": "godot-stage",
  "source_file": "apps/stage-tamagotchi/src/main/services/airi/godot-stage/index.ts",
  "target_files": [
    "apps/stage-tauri/src-tauri/tauri.conf.json",
    "apps/stage-tauri/src-tauri/src/sidecars/godot.rs",
    "apps/stage-tauri/sidecars/godot-stage-x86_64-unknown-linux-gnu"
  ],
  "tasks_expected": ["task-1-godot-sidecar"],
  "context": {
    "blast_radius_notes": "Renderer store packages/stage-ui/stores/godot-stage.ts imports electronGodotStageStatusChanged. Three windows subscribe to status events.",
    "call_chain": "createGodotStageService -> defineInvokeHandler(electronGodotStageStart) -> manager.start()",
    "lessons_learned": "Tauri's tauri-plugin-shell appends the target triple suffix; the binary file must already be in place before `cargo tauri dev`."
  }
}
```

Response (from worker):

```json
{
  "work_unit_id": "sidecar-port-godot",
  "subsystem": "godot-stage",
  "source_file": "apps/stage-tamagotchi/src/main/services/airi/godot-stage/index.ts",
  "target_files": [
    "apps/stage-tauri/src-tauri/tauri.conf.json",
    "apps/stage-tauri/src-tauri/src/sidecars/godot.rs",
    "apps/stage-tauri/sidecars/godot-stage-x86_64-unknown-linux-gnu"
  ],
  "status": "completed",
  "tasks_applied": ["task-1-godot-sidecar"],
  "substitutions": [
    {
      "symbol": "bundle.externalBin",
      "before": "\"externalBin\": []",
      "after": "\"externalBin\": [\"sidecars/godot-stage\"]"
    },
    {
      "symbol": "createGodotStageManager -> godot_stage_start command",
      "before": "TS class with lifecycleMutex + createListenerChannel",
      "after": "Rust gods_stage_start(app, state) -> Result<GodotStageStatus, String> using tokio::sync::Mutex and tauri-plugin-shell"
    },
    {
      "symbol": "startSocketRuntime",
      "before": "H3 + crossws + getRandomPort",
      "after": "std::net::TcpListener::bind(\"127.0.0.1:0\")? + local_addr()?.port() + tokio_tungstenite::accept_async"
    }
  ],
  "verifications": {
    "get_unit_verify": "ok",
    "blast_radius": "no dangling electron references; store still resolves",
    "call_hierarchy_callers": "renderer godot store + 3 subscribing windows intact",
    "call_hierarchy_callees": "tokio_tungstenite + tauri_plugin_shell resolve",
    "register_edit": "ok",
    "diagnostics": "no new warnings (rust-analyzer offline — cargo check is authoritative)",
    "cargo_check": "Finished dev [unoptimized] target(s)",
    "tauri_dev": "main window appeared in 22s, godot-stage spawned, status changed starting->running"
  },
  "notes": [
    "GODOT4 env var was set; dev mode fallback exercised. Exported binary spawn not exercised (no packed binary in dev).",
    "Random port collision retry not triggered; listener bind succeeded first try."
  ],
  "follow_ups": []
}
```

## When to Return to the Orchestrator

Return control to the orchestrator and stop work immediately in any of the following cases:

1. **Work unit complete.** All applicable tasks have been applied, all verification steps pass, and the structured report (see "Example Handoff") has been produced. Hand back the report JSON.

2. **Task mismatch.** The subsystem contains an Electron-specific behavior not covered by Tasks 1–6, and there is no obvious Tauri/Rust equivalent. Do not improvise a substitute; return the subsystem with `status: "blocked"`, `notes` describing the unrecognized behavior, and `follow_ups` requesting an orchestrator decision.

3. **Verification failure that cannot be self-corrected.** A change was applied, but one of the mandatory verification steps fails and a second corrective attempt also fails. Return `status: "blocked"`, attach the failing verification output to `notes`, and list the failing step in `follow_ups`.

4. **Cross-file dependency discovered.** Applying a task requires a coordinated edit to another subsystem outside the current work unit (e.g., the WebSocket transport in `plugin-host/runtimes/node/index.ts` must be implemented before the MCP proxy can be wired; or the i18n locale JSON must be reorganized before the tray can read it). Do not touch the other file unless it is in the current work unit's target list. Return `status: "needs-coordination"`, name the dependent file in `follow_ups`, and let the orchestrator schedule the dependent port.

5. **Missing source or target.** The source file does not exist under `apps/stage-tamagotchi/src/main/`, or the target path under `apps/stage-tauri/` is not writable. Return `status: "blocked"` with the reason in `notes`.

6. **Toolchain missing.** Rust toolchain, `cargo-tauri`, `@vercel/pkg`, or `pkg-fetch` is not installed. Return `status: "blocked"`, list the missing tool in `follow_ups`, and stop. Do not attempt to install system-wide toolchains autonomously — that requires orchestrator/user authorization (per the AGENTS.md note that the user must install Rust before bootstrap).

7. **Sidecar binary absent in dev.** Godot or plugin-host binary not present at the expected path. For Godot, record `GODOT4` env presence and return `status: "blocked"` if neither `GODOT4` nor the binary is available (validators should note "skipped, binary not available" — but the worker's job is to wire the spawn path correctly; missing binaries are an environmental blocker, not a code defect). Do NOT silently degrade.

8. **Renderer contract change requested.** A porting decision requires renaming, splitting, or merging an eventa contract name (e.g., splitting `electron:mcp:call-tool` into per-server commands). Do not change the contract unilaterally — return `status: "needs-coordination"` and name the affected contracts in `follow_ups`; the orchestrator coordinates the renderer-migration worker concurrently.

In all return cases, the worker MUST:

- Stop editing immediately after producing the report.
- Not begin work on the next subsystem in the queue.
- Not modify files outside the current work unit's target list (sources may be READ but not edited).
- Include the full structured report JSON in the response so the orchestrator can record it.
