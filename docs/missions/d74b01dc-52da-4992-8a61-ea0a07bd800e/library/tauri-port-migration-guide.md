# Tauri Port Migration Guide

Practical reference for workers replacing Electron-specific code with Tauri equivalents.

## Renderer-Side Replacements

### Replacing `window.electron.ipcRenderer`

Before:
```ts
const { context } = createContext(window.electron.ipcRenderer)
```

After (`packages/tauri-eventa` shim):
```ts
import { createContext } from '@moeru/eventa/adapters/tauri/renderer'
const { context } = createContext(window.__TAURI_INTERNALS__.ipc)
```

The `@proj-airi/tauri-eventa` package re-exports the existing eventa contracts. Renderer code using `useElectronEventaInvoke` or `useElectronEventaContext` continues to work with the same contract names.

### Replacing `useElectronWindowBounds`, `useElectronMouse`, etc.

Before:
```ts
import { useElectronWindowBounds } from '@proj-airi/electron-vueuse'
```

After:
```ts
import { useElectronWindowBounds } from '@proj-airi/tauri-vueuse'
```

The `@proj-airi/tauri-vueuse` package implements the same composable contracts backed by:
- Tauri IPC via `@proj-airi/tauri-eventa` (same event names + data shapes)
- Rust-side mouse tracking events (`device-mouse-move` emitted by the hitbox thread)

### Replacing `useElectronScreenCapture` (silent capture dropped)

Pure Wayland note: `navigator.mediaDevices.getDisplayMedia()` works on Wayland **only if** `xdg-desktop-portal` and a backend are installed (same requirement as on X11/WebKitGTK). Without the portal, `getDisplayMedia` throws `NotAllowedError`.

Before:
```ts
import { useElectronScreenCapture } from '@proj-airi/electron-screen-capture/vue'
const { setSource, selectWithSource } = useElectronScreenCapture(ipcRenderer, {...})
```

After:
```ts
// Drop silent capture. Use OS native picker (portal on Wayland):
const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
```

If the application needs to persist a chosen source ID across calls (e.g., for vision), use `tauri-plugin-store` to store `selectedDisplayMediaLabel`. No background source enumeration is possible on Tauri — even on X11; on Wayland, there's no way to enumerate sources without user interaction.

### Replacing `useElectronAutoUpdater`

Before:
```ts
const { state, check } = useElectronAutoUpdater()
```

After:
```ts
import { check } from '@tauri-apps/plugin-updater'
const update = await check()
// update.manifest.version, update.downloadAndInstall() — same effect, different shape
```

Adapt by writing a Vue composable in `packages/tauri-vueuse` that wraps the Tauri plugin API into the same reactive shape (`state.availableVersion`, `state.isUpdateAvailable`, `state.progress`, `state.error`).

### Replacing `systemPreferences.getMediaAccessStatus`

Dropped. Tauri apps run inside a webview and must rely on platform-native permission prompts.

Camera/Microphone: Use `navigator.mediaDevices.getUserMedia()` directly — it triggers the OS permission prompt.

Screen: Refer to `navigator.mediaDevices.getDisplayMedia()` above.

### Multi-window communication

Electron uses `ipcMain` to relay events between windows. Tauri has no direct server relay.

Strategy:
1. **Window-local state:** Each `WebviewWindow` invokes Rust commands directly — these hit the same Rust state, so they see consistent state.
2. **Cross-window push events:** Rust uses `app_handle.emit_all("event:name", payload)` to broadcast, or `app_handle.emit_to("label", "event:name", payload)` for targeted dispatch. Use this for:
   - `electron:events:auto-updater:state-changed`
   - `window:bounds` (main window broadcasting to caption overlay)
   - `godot:status-changed`
   - `plugin:updated`

### Multi-window config storage

Tauri apps have a single app state (each window shares the same Rust process). No need for IPC to share config — directly invoke a `read_window_config(window_id)` Rust command that reads from `tauri_plugin_store` or custom `app_data_dir()` files.

### Single-instance guard

`tauri-plugin-single-instance` runs at app startup and tells you if another instance is already running on the same socket/PID file.

```rust
tauri::Builder::default()
  .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
    // Bring front existing window instead of creating new
  }))
```

### Tray

Rust-native `tauri::SystemTray` replaces `electron.Tray`. Menu items map to `tauri::menu::MenuItem`.

### PowerMonitor (suspend/resume/lock)

Dropped. Tauri and Rust both lack portable suspend/resume event sources. Rust-side `power-manager` crates exist but are control-only, no event subscription. Accept the regression or file a follow-up.

### `globalShortcut` (no key-up on Linux)

Use `tauri-plugin-global-shortcut` for basic key-down. If you need key-up (push-to-talk), spawn an `rd-ev` / `input-remapper` daemon that subscribes to `/dev/input/event*` events and emits them to a Tauri event. This is platform-specific Linux code (no portable library). Documented in `Xinyu-Li-123/tauri-clickthrough-demo`.

## Sidecar Bundling

Godot binary + Node plugin host + any bundled CLI tools go into `tauri.conf.json > tauri > bundle > externalBin`:

```json
{
  "bundle": {
    "externalBin": [
      "sidecars/plugin-host",
      "sidecars/godot-stage"
    ]
  }
}
```

Tauri auto-appends the correct `-${TARGET_TRIPLE}` suffix at bundle time and includes in the final package under `resources/`.

To spawn from Rust:

```rust
use tauri::Command;
use tauri::Manager;

#[tauri::command]
fn spawn_plugin_host(app: tauri::AppHandle) -> Result<(), String> {
  Command::new_sidecar("plugin-host").map_err(|e| e.to_string())?
    .spawn()
    .map_err(|e| e.to_string())?;
  Ok(())
}
```

For mobile (Android/iOS): sidecar binaries do not run. Mobile targets must use backend services (channel server API over HTTP/S).

## HTTP/WS Server in Rust

Use `axum` or keep `h3` via `tauri::async_runtime::spawn`. The async runtime is Tokio, so any `tokio`-compatible crate works.

```rust
tauri::Builder::default()
  .setup(|app| {
    tauri::async_runtime::spawn(start_channel_server(app.handle().clone()));
    tauri::async_runtime::spawn(start_godot_bridge(app.handle().clone()));
    Ok(())
  })
```

`app_handle.path().app_data_dir()` returns the writable data dir (equivalent to `app.getPath('userData')`).

## Certificate Generation (replaces mkcert)

```rust
use rcgen::{CertificateParams, DistinguishedName, KeyPair, PKCS_ECDSA_P256_SHA256};
// Self-signed CA
// Leaf cert signed by CA for ["localhost", "<LAN IP>"]
// Serialize to PEM: ca.cert.pem + ca.key.pem, leaf.cert.pem + leaf.key.pem
```

Store PEM under `app_data_dir()`. Platform CA trust install:
- macOS: `Command::new("security").args(["add-trusted-cert", ...]).status()`
- Windows: `Command::new("certutil").args(["-addstore", "Root", ...]).status()`
- Linux (Debian): copy to `/usr/local/share/ca-certificates/` + `update-ca-certificates`
- Linux (Fedora/RHEL): copy to `/etc/pki/ca-trust/source/anchors/` + `update-ca-trust`

## Type Preservations

These renderer-side Electron types are replaced by eventa Tauri adapter types:

| Old import | New import |
|-----------|-----------|
| `import type { BrowserWindow } from 'electron'` | `import type { WebviewWindow } from '@tauri-apps/api/window'` |
| `import type { Display } from 'electron'` | `import type { Monitor } from '@tauri-apps/api/window'` |
| `import type { Rectangle } from 'electron'` | DOMRect / custom `interface { x, y, width, height }` |
| `import type { SourcesOptions } from 'electron'` | Use `DisplayMediaStreamConstraints` from ts lib.dom |
| `import { ipcRenderer } from 'electron'` | `window.__TAURI_INTERNALS__.ipc` |
| `import { contextBridge } from 'electron'` | Remove; not needed in Tauri |
