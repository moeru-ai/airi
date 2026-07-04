# Port AIRI to Tauri (Linux Desktop Primary, Mobile Secondary)

# Mission: Port AIRI from Electron to Tauri

## Plan Overview

This mission ports the AIRI desktop app from Electron to Tauri, targeting Linux as the primary desktop platform with Android/iOS as secondary targets. The renderer monorepo (~90% of the user-facing code) is architecturally decoupled from Electron via `@moeru/eventa`, making it highly portable. The main-process layer (window management, services, IPC) is 100% Electron-native and needs full Rust/Tauri rewrite.

Local inference (onnxruntime-web, @huggingface/transformers, @xsai-transformers, kokoro-js) and silent screen capture (desktopCentCasturer) are dropped as per the user's explicit decision. The remaining features — model rendering (three.js, Live2D, Spine), IPC-driven services, auto-updater, OAuth, MCP servers, channel server, widgets, overlay windows — all have Tauri equivalents or acceptable workarounds.

## Milestones

| # | Milestone | Description |
|---|-----------|-------------|
| 1 | **eventa Adapter** | Write `@moeru/eventa/adapters/tauri/renderer` IPC adapter. Without this, no renderer code can talk to the Tauri backend. |
| 2 | **Main Process Rewrite** | Reimplement all Electron main-process functionality in Rust: window manager, services (channel-server, http-server, auth, MCP, godot-stage), tray, auto-updater. |
| 3 | **Renderer Integration** | Run the Vue 3 renderer inside Tauri webviews. Verify IPC contracts work end-to-end via the eventa adapter. |
| 4 | **Overlay Windows** | Transparent floating windows (caption, widgets, desktop-grounding-click-through workaround). |
| 5 | **Mobile Scaffolding** | Tauri Android/iOS setup, conditional rendering for mobile screens. |

## Architecture

### High-Level System

```
┌─────────────────────────────────────────────┐
│ Tauri App (Rust)                            │
│ ├─ Tauri Commands (IPC entry)               │
│ ├─ Window Manager (transparent, multi-win)   │
│ ├─ Sidecars: Godot/Node MCP/agent runtime   │
│ └─ Plugins: shortcut, updater, store, etc.   │
└───────────────┬─────────────────────────────┘
                │  Tauri invoke/emit/events
┌───────────────▼─────────────────────────────┐
│ @moeru/eventa Tauri Adapter                 │
│ ├─ createContext() over Tauri's IPC         │
│ ├─ defineInvoke → Tauri command proxy       │
│ └─ defineEvent  → Tauri emit/listen proxy   │
└───────────────┬─────────────────────────────┘
                │  eventa contracts (unchanged)
┌───────────────▼─────────────────────────────┐
│ Vue 3 Renderer (kept as-is)                  │
│ ├─ packages/stage-ui/• (model rendering)     │
│ ├─ packages/stage-ui (core UI)              │
│ ├─ apps/stage-tamagotchi/src/renderer/      │
│ │   ├─ bridges/ (window/screen/mouse/etc.) │
│ │   ├─ pages/ (settings, chat, widgets)     │
│ │   ├─ stores/ (reactive IPC state)         │
│ │   └─ composables/                         │
│ └─ plugin-sdk (dynamic JS plugin host)       │
└─────────────────────────────────────────────┘
```

### The Critical Insight

The renderer's IPC surface is fully abstracted behind `@moeru/eventa/eventa`). Current renderer code calls:

```ts
const { context } = createContext(window.electron.ipcRenderer)
useElectronEventaInvoke(context, 'electron:window:get-bounds', ...)
```

If we provide a Tauri-flavored `createContext(tauriIpcAdapter)` that satisfies the same `IpcRenderer`-like interface expected by `@moeru/eventa`, **every one of these calls works without touching application code**. This is the single highest-leverage component.

### Renderer Portability Assessment

- **~90% of renderer files**: Electron-free or eventa-only. Port: zero source changes.
- **~10 HEAVY files** need rewrite: preload, screen-capture composites, desktop-overlay, vibrancy/background-material handling, auto-updater subscription, ResizeHandler.

### What Gets Dropped (User-Confirmed)

- Local inference packages: `@huggingface/transformers`, `onnxruntime-web`, `@xsai-transformers/embed`, `@ricky0123/vad-web`, `kokoro-js`, `libsamplerate-js`, `mediabunny`, `@xsai/stream-transcription`, `@xsai/generate-speech`
- Silent screen capture via `desktopCapturer.getSources()` → replaced by OS native picker (`getDisplayMedia`)
- `setContentProtection` (no Tauri equivalent)
- `alwaysOnTop` priority level (Tauri has only binary toggle)
- uiohook-napi global key-up hooks (Wayland workaround via evdev daemon needed)

### Main Process Replacement Map

| Electron Service | Tauri Replacement |
|---|---|
| `app` (userData, paths) | `tauri::path::app_data_dir()` |
| `BrowserWindow` | `tauri::WebviewWindow` + `WindowBuilder` |
| `ipcMain` | `tauri::command` handlers |
| `screen` | `tauri::window::Monitor` |
| `tray` | `tauri-plugin-notification` / `tauri::SystemTray` |
| `Menu` | `tauri::menu` |
| `shell.openExternal` | `tauri-plugin-opener` |
| `powerMonitor` | No native equivalent (drop or custom `tauri-plugin-power-manager`) |
| `globalShortcut` | `tauri-plugin-global-shortcut` (evdev daemon for Wayland) |
| `session.setCertificateVerifyProc` | `tauri-plugin-http` custom CA trust |
| `electron-updater` (custom feed) | `tauri-plugin-updater` (replaces whole file) |
| `desktopCapturer` | **dropped** (use OS native `getDisplayMedia`) |
| Godot sidecar (`spawn`) | `tauri-plugin-shell` sidecar bundling |
| Node MCP runtime | Sidecar binary or embedded Rust MCP (`rmcp`) |
| mkcert + sys CA install | `rcgen` (Rust) + platform CA store APIs (drop the complexity) |
| Cookie-based plugin auth | Token-based auth rewrite |

### Non-Functional Targets

1. **Performance**: Tauri's per-process memory footprint is ~30-50% lower than Electron at idle (no renderer process overhead per window). Critical for long-running desktop companion.
2. **Linux-first**: All desktop features must work on X11 and XWayland (both are acceptable). Pure Wayland is NOT required because the user is on CachyOS and already transparently uses XWayland (`electron-vite preview -- --ozone-platform=x11`).
3. **Mobile portability**: iOS/Android live views must have conditional rendering via Tauri's `tauri://` platform detection.
4. **Plugin host**: Keep dynamic JS loading via `pkg`-compiled Node sidecar (community `tauri-plugin-deno` is too experimental).

## Environment Setup

Prerequisites verified available in repo:

- Node.js >= 20.14.0, pnpm >= 10.0.0 (existing)
- Rust toolchain (must be installed by user)
- `tauri-cli` v2 (installed via `cargo install tauri-cli`)

New local services the mission will spin up:

| Service | Port | Notes |
|---|---|---|
| Tauri dev (vite HMR) | 1420 (Tauri default) | Replaces electron-vite dev |
| Channel server (ws) | Dynamic (existing) | Keep h3/ws, only cert logic changes |
| Godot sidecar | Dynamic (existing) | No changes to runtime |
| MCP stdio servers | N/A (stdio) | Sidecar binary or rebuilt via `tauri-plugin-shell` |

## Infrastructure

**Off-limits:**
- `apps/stage-tamagotchi/` main process source during Tauri rewrite — don't delete until Tauri windows are verified working.
- `packages/electron-*` dependencies in renderer code — must be replaced with `@proj-airi/tauri-eventa` (new package) as we go.
- Godot stage project path, server-runtime sockets on ports 3000-3100 (other project boundaries).

**Services to keep running:**
- Existing Postgres (if any) — no DB changes for this port.
- h3 server manager — will run inside Tauri app as async task via `tauri::async_runtime`.

## Testing Strategy

### Per-Worker Scoping (TDD + Manual)

Since Vitest is already the monorepo's test runner (194 tests), workers should:
- `pnpm exec vitest run --run --reporter=default` scoped to the package they touched.
- `pnpm -F @proj-airi/stage-ui exec vitest run` for renderer.
- `pnpm typecheck` at the package level for type-safety.
- Manually verify via `cargo tauri dev` (launch the app and exercise flows agent-browser can't reach, like transparent windows).

### Milestone Gate (Scrutiny)

| Check | Command | Notes |
|---|---|---|
| Typecheck | `pnpm -F @proj-airi/<pkg> typecheck` | Per touched package |
| Lint | `pnpm lint --cache` | Full repo (fast) |
| Test | `pnpm exec vitest run --run --reporter=default` | Scoped to touched packages |
| Build | `pnpm -F @proj-airi/<pkg> build` | Verify no broken imports |

The full `pnpm typecheck:engines` and `pnpm run test:run` are too slow for the per-milestone gate but should pass before seal.

### User Testing

Transport: `agent-browser` + manual. Milestone validators must launch the Tauri app (`cargo tauri dev`), reach the same interactive surfaces the Electron app exposes, and assert behavioral equivalence. Static HTML pages are testable via `agent-browser` directly.

Resource classification:
- `agent-browser` (lightweight WebView app): each instance ~200 MB RAM + Tauri app instance ~100 MB. Machine has 18 GB total, ~6 GB baseline, usable headroom ~8.4 GB. Max concurrent: 5.

## Mission Readiness

Verified dependencies ready for the mission:

| Dependency | Status | Notes |
|---|---|---|
| Node.js / pnpm | ✅ | Existing, >= 20.14 / 10.0 |
| Rust toolchain | ❌ | User must install before bootstrap |
| `cargo tauri` CLI | ❌ | Installed with Tauri project scaffold |
| `@moeru/eventa` IPC contracts | ✅ | Transport-agnostic in definition |
| `@moeru/eventa/electron adapters` | ❌ adapter needed | New file to write |
| Tauri plugins (shell, window, store, global-shortcut, updater, etc.) | ✅ | All exist |
| `@huggingface/transformers` | ✅ but unused | Dropped from renderer |
| `electron-updater` | ✅ but unused | Replaced by tauri-plugin-updater |
| `electron-click-drag-plugin` | ✅ but unused | Tauri has `startDragging` natively |
| `uiohook-napi` | ✅ but unused | Custom evdi/evdev daemon needed for Wayland |

The project builds cleanly. No e2e suite exists yet. Vitest browser mode (Playwright) works for component tests. 194 existing unit tests must not regress.

## Feature Decomposition

See `features.json`. The short version:

1. **`eventa-tauri-adapter`**: `@proj-airi/tauri-eventa` package containing `createContext(tauriIpc)` + `setupTauriEventaContext()` + re-exported contracts.
2. **`tauri-app-scaffold`**: New `apps/stage-tauri/` with `Cargo.toml`, `tauri.conf.json`, `main.rs`, capabilities.
3. **`main-window-service`**: Rust: main window, tray, openExternal, quit, autostart.
4. **`multi-window-service`**: Rust: settings, chat, about, notice, widgets, beat-sync, inlay windows. Transparent floating panels. (Desktop-overlay gated off until click-through workaround lands.)
5. **`auth-and-server-channel`**: Rust: OIDC loopback + server channel with self-signed certs via `rcgen`.
6. **`mcp-stdio-sidecar`**: Rust or Node sidecar: spawn stdio MCP servers, health monitoring, config.
7. **`godot-stage-sidecar`**: Tauri sidecar bundling config + spawn logic.
8. **`plugin-host-adapter`**: Token-based cookie replacement + Node sidecar for dynamic JS execution.
9. **`auto-updater`**: Tauri plugin binding, drop custom feed logic (use Tauri's updater first, custom later if needed).
10. **`mobile-scaffold`**: Tauri android/ios init + conditional screen rendering.
11. **`renderer-vite-migrate`**: Update `electron.vite.config.ts` → Vite config for Tauri. Replace `RUNTIME_ENVIRONMENT='electron'` with `'tauri'`.
12. **`drop-local-inference`**: Remove `@huggingface/transformers`, `onnxruntime-web`, etc. from renderer deps.
13. **`screen-capture-picker`**: Replace `useElectronScreenCapture` with `navigator.mediaDevices.getDisplayMedia()` wrapper.
14. **`overlay-click-through`**: Hitbox-polling workaround (`@Xinyu-Li-123/tauri-clickthrough-demo` approach) for desktop grounding.
15. **`desktop-overlay-gated`**: Re-implement desktop overlay with `focusable: false`, click-through via hitbox, heartbeat MCP polling.

## Non-Functional Requirements

1. Portable: No Electron imports outside main-process packages. Build must succeed with `cargo tauri build`.
2. Testable: Vitest tests still pass for renderer packages.
3. Observable: Sentry Rust SDK integrated. Metrics via `tauri-plugin-sentry` or manual.
4. Secure: No secrets in committed files. Use Tauri's capability ACL system for window IPC.