# Plugin Host Sidecar Runtime Design

## Goal

Finish the deferred plugin-host sidecar runtime slice without reopening the completed plugin registry/config surface. When a plugin-host sidecar binary is available, Stage Tauri should start it, verify its local status endpoint, and expose that state through the existing plugin IPC inspection flow. When the binary is absent or unhealthy, the UI keeps the current degraded behavior.

## Scope

In scope:

- Add a Tauri-side plugin-host sidecar controller with `stopped`, `booting`, `ready`, and `degraded` states.
- Resolve the sidecar from `AIRI_PLUGIN_HOST_PATH` or `<app_data_dir>/sidecars/plugin-host-*`, reusing the current resolver.
- Start the sidecar from `electron_plugins_load_enabled()` and `electron_plugins_load()` instead of always writing a degraded capability.
- Probe `GET /health` on a localhost HTTP endpoint supplied to the sidecar through CLI flags and mark the sidecar ready only after a successful HTTP 200 response.
- Include sidecar status in `electron_plugins_inspect()` so `/settings/plugins` and devtools can show real runtime state.
- Implement the `websocket` branch of `packages/plugin-sdk/src/plugin-host/runtimes/node/createPluginContext()` using Node's built-in `WebSocket` constructor.

Out of scope:

- Adding a packaging dependency or producing a real `pkg`-compiled binary in this PR.
- Implementing the complete plugin-host HTTP/WebSocket API surface.
- Reworking plugin registry, manifest discovery, or config persistence.
- Migrating the primary settings router beyond the existing `/settings/plugins` bridge.

## Architecture

The Tauri app gets a new `PluginHostSidecarController`, managed beside the existing `PluginHostState`. Its shape follows the existing `GodotStageController`: it owns an optional child process, exposes blocking start/stop/status methods behind a mutex, cleans up the child on drop, and returns a serializable status payload.

Start flow:

1. Resolve sidecar binary from env override or app-data sidecar directory.
2. Choose a localhost status port from an available ephemeral port.
3. Spawn the sidecar with explicit arguments:
   - `--airi-plugin-root=<app_data_dir>/plugins`
   - `--airi-config-path=<app_data_dir>/plugins-v1.json`
   - `--airi-host=127.0.0.1`
   - `--airi-port=<port>`
4. Poll `GET /health` for a short bounded window.
5. Mark status as `ready` when the response starts with `HTTP/1.1 200` or `HTTP/1.0 200`; otherwise mark `degraded` and clean up the child.

The existing plugin commands continue returning registry snapshots. They additionally update the `plugin-host:sidecar` capability with the controller status metadata, and `electron_plugins_inspect()` includes a `sidecar` object next to `registry`, `sessions`, `kits`, `modules`, and `capabilities`.

## SDK Runtime

`packages/plugin-sdk/src/plugin-host/runtimes/node/index.ts` should stop throwing for `{ kind: "websocket" }`. It will create a `WebSocket` with `new WebSocket(url, protocols)` and pass it to the existing Eventa WebSocket adapter. This is deliberately minimal: retry, heartbeat, and reconnect policy are excluded from this PR and belong to a separate reliability-focused task.

The implementation must validate that `globalThis.WebSocket` exists and throw a deterministic error if a Node runtime without built-in WebSocket support is used.

## Error Handling

- Missing sidecar binary returns a degraded status with a message naming `AIRI_PLUGIN_HOST_PATH` and the expected app-data sidecar directory.
- Spawn failure returns degraded with the executable path and OS error.
- Health timeout kills the child, waits for it, and returns degraded with the probed URL.
- If an already-running child is still alive, start is idempotent and returns the current status.
- If a child exits unexpectedly, the next status/inspect call marks the sidecar degraded.

## Testing

TDD will cover the behavior before implementation:

- Rust unit tests for sidecar status serialization, missing binary degradation, fake executable start/stop transitions, and health timeout cleanup.
- Rust unit tests for launch argument construction and localhost health probe parsing.
- Existing registry/config tests remain unchanged.
- Plugin SDK Vitest tests for the node runtime WebSocket branch:
  - constructs a WebSocket with URL and protocols;
  - throws a deterministic error when `globalThis.WebSocket` is unavailable.

Verification commands:

- `cargo test --manifest-path apps/stage-tauri/Cargo.toml plugin_host`
- `cargo test --manifest-path apps/stage-tauri/Cargo.toml sidecar`
- `pnpm -F @proj-airi/plugin-sdk exec vitest run src/plugin-host/runtimes/node/index.test.ts`
- `pnpm -F @proj-airi/plugin-sdk typecheck`

## Acceptance

- With no binary, plugin load/inspect remains degraded and does not throw.
- With a fake local sidecar that serves `/health`, plugin load/inspect reports `ready` and includes pid, endpoint, executable path, and updated timestamp.
- Stopping or dropping the controller leaves no child process behind.
- The SDK node runtime accepts `websocket` transport on supported Node versions.
