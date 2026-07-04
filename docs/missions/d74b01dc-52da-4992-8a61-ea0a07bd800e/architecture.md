# Architecture: AIRI Tauri Port

## System Overview

```
┌─────────────────────────────────────────────┐
│ Tauri App (Rust)                            │
│ ├─ Tauri Commands (IPC entry points)        │
│ ├─ Window Manager (transparent, multi-win)   │
│ ├─ Sidecars: Godot/Node MCP runtime          │
│ └─ Plugins: shortcut, updater, store, etc.   │
└───────────────┬─────────────────────────────┘
                │  Tauri invoke/emit/events
┌───────────────▼─────────────────────────────┐
│ @proj-airi/tauri-eventa (new)               │
│ ├─ createContext(tauriIpcAdapter)           │
│ ├─ defineInvoke → Tauri command proxy      │
│ └─ defineEvent  → Tauri emit/listen proxy   │
└───────────────┬─────────────────────────────┘
                │  eventa contracts (unchanged)
┌───────────────▼─────────────────────────────┐
│ Vue 3 Renderer (migrated)                    │
│ ├─ packages/stage-ui-{three,live2d,spine}   │
│ ├─ packages/stage-ui (core UI)              │
│ ├─ apps/stage-tauri/src/renderer/           │
│ │   ├─ bridges/ (window/screen/mouse/...)  │
│ │   ├─ pages/ (settings, chat, widgets)    │
│ │   ├─ stores/ (reactive IPC state)        │
│ │   └─ composables/                        │
│ └─ plugin-sdk (dynamic JS plugin host)      │
└─────────────────────────────────────────────┘
```

## Layer: Tauri Backend (Rust)

Responsibilities:
- Main process lifecycle (`tauri::Builder`, setup, plugin registration)
- Per-window state (each Tauri `WebviewWindow` owns its command handlers)
- Sidecar process spawning (Godot, Node plugin host MCP bridge)
- Certificate management (`rcgen` for self-signed, system CA install via `security`/`certutil`/`update-ca-ca-certificates`)
- mTLS channel server (h3 + `tokio-rustls` inside `tauri::async_runtime`)
- Auto-updater (`tauri-plugin-updater`, JSON manifest served from GitHub releases)

### Window Manager

Mirrors the current `apps/stage-tamagotchi/src/main/windows/` structure:

| Window | Transparency | Special |
|--------|-------------|---------|
| main | `transparent: true`, `decorations: false` | floating panel-like, always-on-top |
| chat | standard | |
| settings | standard | |
| widgets | `transparent: true`, `decorations: false` | |
| caption | `transparent: true`, `decorations: false` | tracks main window, click-through toggle via hitbox |
| beat-sync | hidden | audio processing only |
| inlay | `transparent: true`, `decorations: false` | responsive HUD |
| desktop-overlay | `transparent: true`, `decorations: false`, `always_on_top: true`, `skip_taskbar: true` | gated behind env/flag |
| about, notice, devtools, onboarding | standard | |
| dashboard | `transparent: true` (for consistency) | |

### IPC Surface

Rust commands exposed to renderer (maps eventa invoke/event contracts):

```
Commands:
  - window_get_bounds
  - window_set_bounds
  - window_set_ignore_mouse_events (no forward param — Tauri limitation)
  - window_close
  - window_set_always_on_top
  - window_lifecycle_state (one-shot query)
  - screen_get_cursor_position
  - screen_get_all_displays
  - screen_get_primary_display
  - screen_dip_to_screen_point / dip_to_screen_rect
  - screen_screen_to_dip_point / screen_to_dip_rect
  - screen_capture_get_sources (returns empty on Tauri — silent capture dropped)
  - screen_capture_set_source (returns error)
  - system_preferences_get_media_access_status (platform-dependent, returns "granted" on Linux)
  - app_quit
  - app_get_platform (returns "macos"|"windows"|"linux")
  - app_open_user_data_folder
  - auth_start_login
  - auth_logout
  - server_channel_get_config
  - server_channel_apply_config
  - server_channel_get_qr_payload
  - auto_updater_check_for_updates
  - auto_updater_download_update
  - auto_updater_quit_and_install
  - mcp_list_tools / mcp_call_tool / mcp_get_runtime_status / mcp_apply_and_restart
  - mcp_read_config / mcp_write_config / mcp_test_server
  - mcp_open_config_file
  - godot_start / godot_stop / godot_get_status / godot_apply_scene_input / godot_request_snapshot
  - plugin_list / plugin_set_enabled / plugin_load_enabled / plugin_unload / plugin_inspect
  - widgets_open_window / widgets_hide_window / widgets_add / widgets_update / widgets_remove / widgets_clear / widgets_fetch / widgets_iframe_publish

Events (emitted to renderer):
  - window:bounds
  - window:lifecycle-changed
  - screen:cursor-screen-point
  - electron:app:suspended|resumed|lock-screen|unlock-screen (no-op stub — drop)
  - auto-updater:state-changed
  - auth:callback|callback-error
  - server-channel:status-changed
  - godot:status-changed|view-snapshot-changed|view-state-error
  - plugin:updated|tools-changed
  - widgets:render-event|remove-event|clear-event|update-event
```

## Layer: eventa Tauri Adapter (`@proj-airi/tauri-eventa`)

The sole IPC translation layer between the Tauri backend and the renderer's existing eventa contracts.

### Why this is the keystone

The renderer code (~90% of user-facing surface) exclusively uses `@moeru/eventa` for IPC. Example:

```ts
const { context } = createContext(ipcRenderer)
const bounds = useElectronEventaInvoke(context, 'electron:window:get-bounds', ...)
```

If `createContext` accepts a Tauri-backed adapter, application code requires zero changes. The adapter implements:

```ts
interface EventaTauriAdapter {
  invoke(channel: string, ...args: any[]): Promise<any>
  on(event: string, handler: (payload: any) => void): void
  emit?(event: string, payload: any): void  // Tauri doesn't let renderer emit cross-window
}
```

`emit` is handled by Tauri's `WebviewWindow::emit_to` — the adapter wraps `invoke('__tauri_emit_to__', ...)` for cross-window events that the current architecture relies on.

### Why dropping `forward` in set-ignore-mouse-events matters

Electron's `setIgnoreMouseEvents(true, { forward: true })` lets developers toggle click-through by CSS (`pointer-events: none` on transparent areas, toggled via `pointerover`/`pointerleave`). This is used in the caption and desktop-overlay windows.

Tauri's `Window::set_ignore_cursor_events(bool)` has no `forward` flag.

Workaround implemented in the Tauri side:
1. Rust spawns a background thread reading `rd-ev` global mouse coordinates via `/dev/input/event*` (Linux) or `NSEvent`/`SetWindowsHookEx` (macOS/Windows).
2. Rust emits `device-mouse-move: { x: y }` events to the webview at 60 Hz.
3. Renderer hitbox function calculates transparent regions and calls `window.setIgnoreCursorEvents(shouldIgnore)`.

This is the community-verified workaround from `Xinyu-Li-123/tauri-clickthrough-demo`.

## Layer: Renderer (Vue 3, ke TypeScript)

Kept essentially as-is. Portability categories:

**A. Keep as-is** (zero changes):
- `packages/ui/`, `packages/i18n/`, `packages/audio/`
- `packages/core-agent/`, `packages/core-character/`, `packages/core-terminal/`
- `packages/model-driver-lipsync/`
- `packages/server-runtime/`, `packages/server-sdk/`, `packages/server-sdk-shared/`
- `packages/plugin-protocol/`, `packages/plugin-sdk/`
- `packages/stream-kit/`, `packages/ccc/`, `packages/vishot-runtime/`
- `packages/ui-transitions/`, `packages/stage-layouts/`
- `packages/stage-ui-live2d/`, `packages/stage-ui-spine/`, `packages/stage-ui-three/`
- `packages/pattern-disruptor/`, `packages/resilience/`, `packages/drizzle-duckdb-wasm/`
- `packages/stage-pages/`, `packages/stage-shared/` (final shared)
- 80%+ of `packages/stage-ui/src/`
- Most of `apps/stage-tamagotchi/src/renderer/` (store, pages, components that go through eventa)

**B. Light coupling** (replace eventa's `createContext(window.electron.ipcRenderer)` with `createContext(tauriIpcAdapter)` via shim):
- `packages/stage-ui/stores/mcp-tools.ts`, `stores/plugin-tools.ts`, `stores/window-lifecycle.ts`
- `packages/stage-ui/stores/settings/server-channel.ts`
- `apps/stage-tauri/src/renderer/pages/devtools/global-shortcut.vue`
- `apps/stage-tauri/src/renderer/pages/widgets.vue`
- `apps/stage-tauri/src/renderer/pages/notice/fade-on-hover.vue`
- `apps/stage-tauri/src/renderer/pages/settings/modules/mcp.vue`
- `apps/stage-tauri/src/renderer/pages/settings/account/index.vue`
- `apps/stage-tauri/src/renderer/pages/settings/system/developer.vue`
- `apps/stage-tauri/src/renderer/pages/settings/connection/server-channel-qr-card.vue`
- `apps/stage-tauri/src/renderer/widgets/extension-ui/.../extension-ui-host.vue`
- `apps/stage-tauri/src/renderer/widgets/artistry/.../Comfy.vue`
- `apps/stage-tauri/src/renderer/components/stage-islands/status-island/index.vue`
- `apps/stage-tauri/src/renderer/components/stage-islands/controls-island/*.vue`

**C. Medium coupling** (replace `@proj-airi/electron-vueuse` with `@proj-airi/tauri-vueuse` which implements the same composables backed by eventa Tauri):
- `packages/stage-ui/stores/window.ts`
- `apps/stage-tauri/src/renderer/pages/devtools/use-window-mouse.vue`
- `apps/stage-tauri/src/renderer/pages/devtools/use-electron-relative-mouse.vue`
- `apps/stage-tauri/src/renderer/pages/devtools/use-electron-all-displays.vue`
- `apps/stage-tauri/src/renderer/pages/about.vue`

**D. Heavy coupling** (rewrite / restructure):
- `apps/stage-tauri/src/renderer/preload/` — remove preload entirely; Tauri injects IPC via `@tauri-apps/api`
- `apps/stage-tauri/src/renderer/pages/inlay/index.vue` — vibrancy/background-material concepts not portable; use Tauri's static vibrancy config
- `apps/stage-tauri/src/renderer/components/ResizeHandler.vue` — rewrite to use Tauri window API
- `apps/stage-tauri/src/renderer/pages/desktop-overlay.vue` — gated behind env, hitbox click-through + heartbeat polling
- `apps/stage-tauri/src/renderer/composables/use-vision-screen-capture.ts` — replace with `getDisplayMedia`
- `apps/stage-tauri/src/renderer/components/WithScreenCapture.vue` — same
- `apps/stage-tauri/src/renderer/pages/devtools/screen-capture.vue` — same
- `apps/stage-tauri/src/renderer/pages/devtools/vision.vue` — same
- `apps/stage-tauri/src/renderer/pages/devtools/updater.vue` — replace with `tauri-plugin-updater` bindings
- `packages/stage-shared/src/beat-sync/detector.ts` — replace `setupElectronScreenCapture` shim

**E. Dropped (local inference + silent capture)**:
- `@huggingface/transformers`, `onnxruntime-web`, `@xsai-transformers/embed`, `@ricky0123/vad-web`, `kokoro-js`, `libsamplerate-js`, `mediabunny`, `@xsai/stream-transcription`, `@xsai/generate-speech`

### Browser / WASM Compatibility

All rendering runs in Tauri's platform webview:
- **Windows**: WebView2 (Chromium) — full WebGL2, WebGPU optional later
- **Linux**: WebKitGTK — WebGL2 OK, no WebGPU even on vendor drivers (acceptable, no local inference)
- **macOS**: WebView (Safari/WebKit) — WebGL2 OK, WebGPU for potential future ML
- **iOS**: WKWebView
- **Android**: WebView

WebGL2 is supported on all targets with the same flags Electron currently sets (except no `--enable-unsafe-webgpu-needed`).

### Certificates and mTLS

Current: `mkcert` (Go CLI) generating CA + leaf cert, per-platform CA trust via `security`/`certutil`/`update-ca-certificates`.

New: Pure Rust with `rcgen` for cert generation. CA trust store install kept as simple shell-exec wrappers. mkcert dropped.

### Plugin Host

Dynamic JS plugin loading is fundamentally incompatible with Rust-only execution. Strategy: ship a `pkg`-compiled Node.js binary as a Tauri sidecar that runs the existing `@proj-airi/plugin-sdk/plugin-host` unchanged. The Tauri frontend communicates with the plugin host over a local WebSocket (current pattern over private IPC, mapped easily).

This preserves the full plugin ecosystem without rewriting it.

### Godot Stage

Current: Electron main spawns Godot binary, WebSocket bridge with token auth.

New: Tauri sidecar with same pattern. `bundle.externalBin` config, `tauri-plugin-shell` `Command::new_sidecar()`, same WebSocket protocol.

### Channel Server

Current: h3 + mkcert mTLS inside Electron main.

New: h3 + rcgen mTLS as a Tauri async task (`tauri::async_runtime::spawn`). Cert storage in `app_data_dir()`.

### MCP stdio

Current: `@modelcontextprotocol/sdk/client/stdio.js` spawning MCP server binaries from Electron main.

New: keep Node SDK but package it inside the plugin host sidecar. Rust tauri-plugin wires the renderer's MCP service methods to the sidecar over WebSocket.

## Port Validation Surfaces

The mission's validators will test through:
1. **Linux desktop shell** — `cargo tauri dev` on CachyOS (primary target, Wayland+ XWayland)
2. **agent-browser** — drive the rendered UI
3. **Serialized screenshot snapshots** — pixel-level verification of character render on Linux desktop

Milestones validate the Tauri port by behavioral equivalence to the Electron app's current behavior on Linux, plus additional assertions for:
- Mobile-capable screens render without panicking on desktop
- All IPC contract invocations succeed (verified via agent-browser console logs + UI state)
- Transparency/click-through workaround activates on mouse move
- channel-server starts and exposes QR code
- plugin host sidecar launches and reports loaded plugins
- Godot sidecar spawns and reports status
- auto-updater surfaces available release info

## Platform-Specific Notes

### Linux wayland ONLY (Primary)

`electron`'s X11 path is dead — we run exclusively under Wayland.

- Pure Wayland session required. No X11 fallback.
- No WebGPU, no local inference, no silent screen capture, no dynamic vibrancy.
- `rd-ev` background thread for global mouse events (hitbox click-through).
- Wayland protocols relied upon:
  - `wlr-foreign-toplevel-management` (or equivalent) for window matching
  - `xdg-desktop-portal` + backend (`xdesktop-portal-kde` / `xdesktop-portal-gtk` / `xdesktop-portal-wlr`) for screen capture via PipeWire
  - D-Bus `org.freedesktop.ScreenShot` API for silent capture (if permission granted by compositor)
  - KDE/GNOME best-supported; wlroots compositors (Sway/Hyprland) have limitations
- Transparency and always-on-top are compositor-dependent. Tauri's `transparent` and `always_on_top` APIs rely on the compositor honoring the request.
- Global shortcuts use D-Bus `org.freedesktop.Application` or `xdesktop-portal-kde`'s `global-shortcut` API. The upstream `tauri-plugin-global-shortcut` crate fails on pure Wayland — we must implement via platform-agnostic D-Bus calls or use a community crate with Wayland support.

### Desktop (macOS / Windows)

- Full feature parity with Linux except macOS `titlebar_hidden`/`vibrancy: hud` for window chrome, Windows WebView2 `SetColor` for transparency.
- uiohook-style key-up via macOS `NSEvent` tap (if needed for push-to-talk); Windows global keyboard hook.

### Mobile (Android / iOS) — Secondary

- Same Rust backend, different native webview wrapper.
- Suspended when app backgrounded — channel server + MCP paused; UI stays alive.
- Conditional rendering via `window.__TAURI_INTERNALS__?.metadata.currentWebview.label` + `matchMedia('hover: none')`.
- Platform-specific "mobile shell" page loaded on touch devices, routing to `packages/stage-ui/stores/` mobile branch.
- Sidecar processes backgrounded on mobile — plugins via cloud MCP fallback.
