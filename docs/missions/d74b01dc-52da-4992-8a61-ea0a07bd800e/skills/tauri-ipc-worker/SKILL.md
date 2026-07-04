---
name: tauri-ipc-worker
description: Implements Tauri Rust backend commands, the eventa Tauri adapter packages (`packages/tauri-eventa/`, `packages/tauri-vueuse/`), the Tauri app scaffold (`apps/stage-tauri/`), Rust-side channel server, MCP bridge, Godot bridge, and verifies builds for contracts re-implemented from `packages/electron-eventa/` and `packages/electron-vueuse/`.
---

# Tauri IPC Worker

## Scope

Port a single Electron IPC contract, Rust command handler, eventa adapter module, or Rust sidecar subsystem from Electron to Tauri. One work unit per step; never bundle unrelated commands or subsystems into a single step.

### Source roots

- `packages/electron-eventa/src/electron/*.ts` — eventa invoke/event contract definitions (window, screen, system-preferences, app, powerMonitor).
- `packages/electron-eventa/src/electron-updater/index.ts` — auto-updater contracts.
- `packages/electron-vueuse/src/composables/*.ts` — VueUse-like composables backed by eventa context.
- `apps/stage-tamagotchi/` — original Electron app (read-only reference for behavior).

### Target roots

- `packages/tauri-eventa/` — Tauri eventa adapter package (`createContext(tauriIpc)`, re-exported contracts, composables).
- `packages/tauri-vueuse/` — Tauri VueUse composables (same composable names and return shapes as `electron-vueuse`).
- `apps/stage-tauri/` — Tauri Rust + frontend app.
  - `src/main.rs` — Tauri builder, plugin registration, command registration, event registration, async task spawns, tray.
  - `src/channel-server.rs` — h3 + `tokio-rustls` mTLS server with `rcgen` self-signed certs.
  - `src/mcp-bridge.rs` — MCP stdio server spawner + WebSocket bridge.
  - `src/godot-bridge.rs` — Godot sidecar spawner + WebSocket bridge.
  - `tauri.conf.json` — window config matching `architecture.md` window manager table.
  - `Cargo.toml` — crate manifest with all `tauri-plugin-*` dependencies.

## Background

### The eventa keystone

The renderer calls IPC exclusively through `@moeru/eventa`. Every contract has a stable string ID of the form `eventa:invoke:electron:window:get-bounds` (invoke) or `eventa:event:electron:window:bounds` (event). These IDs are **interface contracts**: they MUST NOT change when porting to Tauri, or every renderer consumer breaks.

The Tauri side maps each invoke contract to a Rust `#[tauri::command]` function whose name can be either a snake_case identifier (e.g., `electron_window_get_bounds`) or an explicit `#[command(name = "electron:window:get-bounds")]`. The snake_case form is preferred for ergonomics; the explicit name form is used only when the IPC layer disallows colons (it generally does not, but verify against the installed `@tauri-apps/api` version).

### Contract surface (authoritative inventory)

Re-read the original definitions before writing the Rust mirror. The complete Electron contract surface that must be re-implemented:

#### Window contracts (`packages/electron-eventa/src/electron/window.ts`)

| Contract ID | Kind | Tauri command name | Notes |
|---|---|---|---|
| `eventa:event:electron:window:bounds` | event | (emit) `electron:window:bounds` | Rust emits on resize/move; payload `{ x, y, width, height }` |
| `eventa:event:electron:window:start-loop-get-bounds` | event | `electron_window_start_loop_get_bounds` | One-shot: starts a loop that emits `bounds` events |
| `eventa:invoke:electron:window:get-bounds` | invoke | `electron_window_get_bounds` | Returns `{ x, y, width, height }` |
| `eventa:invoke:electron:window:set-bounds` | invoke | `electron_window_set_bounds` | Tauri: use `window.set_position` + `window.set_size` |
| `eventa:invoke:electron:window:set-ignore-mouse-events` | invoke | `electron_window_set_ignore_mouse_events` | Tauri `set_ignore_cursor_events(bool)`. **No `forward` param** (see "Forward flag regression" below) |
| `eventa:invoke:electron:window:set-vibrancy` | invoke | `electron_window_set_vibrancy` | Static config on Tauri; command is a no-op or error |
| `eventa:invoke:electron:window:set-background-material` | invoke | `electron_window_set_background_material` | Static config on Tauri; no-op |
| `eventa:invoke:electron:window:resize` | invoke | `electron_window_resize` | `{ deltaX, deltaY, direction: ResizeDirection }` |
| `eventa:invoke:electron:window:close` | invoke | `electron_window_close` | `window.close()` |

#### Screen contracts (`packages/electron-eventa/src/electron/screen.ts`)

| Contract ID | Kind | Tauri command name |
|---|---|---|
| `eventa:event:electron:screen:cursor-screen-point` | event | (emit) `electron:screen:cursor-screen-point` |
| `eventa:event:electron:screen:start-loop-get-cursor-screen-point` | event | `electron_screen_start_loop_get_cursor_screen_point` |
| `eventa:invoke:electron:screen:get-all-displays` | invoke | `electron_screen_get_all_displays` |
| `eventa:invoke:electron:screen:get-primary-display` | invoke | `electron_screen_get_primary_display` |
| `eventa:invoke:electron:screen:get-cursor-screen-point` | invoke | `electron_screen_get_cursor_screen_point` |
| `eventa:invoke:electron:screen:dip-to-screen-point` | invoke | `electron_screen_dip_to_screen_point` |
| `eventa:invoke:electron:screen:dip-to-screen-rect` | invoke | `electron_screen_dip_to_screen_rect` |
| `eventa:invoke:electron:screen:screen-to-dip-point` | invoke | `electron_screen_screen_to_dip_point` |
| `eventa:invoke:electron:screen:screen-to-dip-rect` | invoke | `electron_screen_screen_to_dip_rect` |

#### App contracts (`packages/electron-eventa/src/electron/app.ts`)

| Contract ID | Kind | Tauri command name |
|---|---|---|
| `eventa:invoke:electron:app:is-macos` | invoke | `electron_app_is_macos` |
| `eventa:invoke:electron:app:is-windows` | invoke | `electron_app_is_windows` |
| `eventa:invoke:electron:app:is-linux` | invoke | `electron_app_is_linux` |
| `eventa:invoke:electron:app:quit` | invoke | `electron_app_quit` |

#### SystemPreferences contracts (`packages/electron-eventa/src/electron/system-preferences.ts`)

| Contract ID | Kind | Tauri command name | Notes |
|---|---|---|---|
| `eventa:invoke:electron:system-preferences:get-media-access-status` | invoke | `electron_system_preferences_get_media_access_status` | Returns `"granted"` on Linux (stub) |
| `eventa:invoke:electron:system-preferences:ask-for-media-access` | invoke | `electron_system_preferences_ask_for_media_access` | Returns `"granted"` on Linux (stub) |

#### PowerMonitor events (`packages/electron-eventa/src/electron/powerMonitor.ts`)

| Contract ID | Kind | Notes |
|---|---|---|
| `eventa:event:electron:app:suspended` | event | No Tauri equivalent; emit stub or omit |
| `eventa:event:electron:app:resumed` | event | Same |
| `eventa:event:electron:app:lock-screen` | event | Same |
| `eventa:event:electron:app:unlock-screen` | event | Same |

#### Auto-updater contracts (`packages/electron-eventa/src/electron-updater/index.ts`)

| Contract ID | Kind | Tauri command name | Notes |
|---|---|---|---|
| `eventa:event:electron:auto-updater:state-changed` | event | (emit) `electron:auto-updater:state-changed` | Rust emits state transitions |
| `eventa:invoke:electron:auto-updater:get-state` | invoke | `electron_auto_updater_get_state` | Returns `AutoUpdaterState` |
| `eventa:invoke:electron:auto-updater:check-for-updates` | invoke | `electron_auto_updater_check_for_updates` | Wraps `tauri-plugin-updater` |
| `eventa:invoke:electron:auto-updater:download-update` | invoke | `electron_auto_updater_download_update` | |
| `eventa:invoke:electron:auto-updater:quit-and-install` | invoke | `electron_auto_updater_quit_and_install` | |

### Composable surface (`packages/electron-vueuse/src/composables/*.ts`)

These composables must be re-exported from `@proj-airi/tauri-vueuse` with **identical names and return shapes** (downstream consumers depend on the stable API):

| Composable | Source file | Notes |
|---|---|---|
| `useElectronEventaContext` | `use-electron-eventa-context.ts` | Resolves Tauri `__TAURI_INTERNALS__.ipc` instead of electron `ipcRenderer` |
| `useElectronEventaInvoke` | `use-electron-eventa-context.ts` | `defineInvoke` over tauri context |
| `getElectronEventaContext` | `use-electron-eventa-context.ts` | Shared context singleton |
| `useElectronWindowBounds` | `use-electron-window-bounds.ts` | Reactive `{ x, y, width, height }` |
| `useElectronWindowResize` | `use-electron-window-resize.ts` | `handleResizeStart` for drag-resize |
| `useElectronMouse` | `use-electron-mouse.ts` | Screen mouse coords; listens to `electron:screen:cursor-screen-point` |
| `useElectronMouseEventTarget` | `use-electron-mouse.ts` | Event target backed by backend cursor events |
| `useElectronRelativeMouse` | `use-electron-relative-mouse.ts` | Combines mouse + window bounds |
| `useElectronMouseInElement` | `use-electron-mouse-in-element.ts` | Element-relative mouse tracking |
| `useElectronMouseInWindow` | `use-electron-mouse-in-window.ts` | Window-relative mouse tracking |
| `useElectronMouseAroundWindowBorder` | `use-electron-mouse-around-window-border.ts` | Border proximity detection |
| `useElectronAllDisplays` | `use-electron-all-displays.ts` | Reactive `Monitor[]` from backend |
| `useElectronAutoUpdater` | `use-electron-auto-updater.ts` | Responsive auto-updater state |

### Critical regressions documented in mission context

1. **Forward flag regression.** Electron's `setIgnoreMouseEvents(true, { forward: true })` lets transparent CSS control click-through. Tauri's `WebviewWindow::set_ignore_cursor_events(bool)` has **no `forward` argument**. Workaround: the Rust side spawns a per-window hitbox thread reading `/dev/input/event*` on Linux (or `NSEvent`/`SetWindowsHookEx` on macOS/Windows), emitting `device-mouse-move` events at ~60 Hz. The renderer then toggles `set_ignore_cursor_events` based on a hitbox function.

2. **`setIgnoreCursorEvents` lives on `WebviewWindow`, not `AppHandle`.** When wiring the `electron_window_set_ignore_mouse_events` command, fetch the current window via `app.get_webview_window(&label)` or accept the window as a command argument (`window: tauri::WebviewWindow`) and call `window.set_ignore_cursor_events(flag)` directly. Attempting `app_handle.set_ignore_cursor_events(...)` will not compile.

3. **Never panic on missing resources.** Rust commands that return `Result<T, String>` must `map_err(|e| e.to_string())` rather than `.unwrap()`. The renderer relies on the error message propagating through `invoke` to present a meaningful error to the user. Panics abort the Tauri process and orphan all windows.

4. **Async tasks use `tauri::async_runtime::spawn`.** Channel server, godot bridge, and mcp bridge run as long-lived async tasks spawned during `setup`. Use `tauri::async_runtime::spawn(future)` (which is `tokio::spawn` under the hood), not `std::thread::spawn`, because these tasks need async I/O.

5. **Cross-window events use `emit_all` / `emit_to`.** `window.app_handle().emit_all("event:name", payload)` broadcasts; `window.emit_to("label", "event:name", payload)` targets a single window. Use `emit_all` for window-bounds broadcasts (caption window must follow main), `emit_to` for targeted services (godot status → settings page only).

6. **`set_ignore_cursor_events` vs `set_cursor_visible`** — do not confuse these. The former toggles click-through, the latter toggles cursor visibility. The hitbox thread needs the former.

### Hitbox thread lifecycle

Per-window thread that:

1. Is spawned in `setup` for each transparent, click-through-capable window (caption, widgets, desktop-overlay if gated on).
2. Moves with the window (re-evaluates screen coordinates periodically; on Wayland this requires recomputing window position via `window.outer_position()`).
3. On Linux reads `/dev/input/event*` (prefer the `evdev` crate over raw file reads; fallback to `rd-ev` global coords).
4. Emits `device-mouse-move` events to its owning window via `window.emit("device-mouse-move", { x, y })` at ~60 Hz (throttle to avoid flooding the renderer event loop).
5. Terminates when the window closes (use a `JoinHandle` + a `Mutex<Option<JoinHandle>>` stored in `tauri::State`, or drop the sender end of a channel to signal exit).

## Required Skills

- `using-superpowers` — establish skill discovery before any other action.
- `verification-before-completion` — run `cargo build` / `pnpm -F @proj-airi/tauri-eventa build` and confirm output before claiming a step is complete.
- `test-driven-development` — when a Rust command has an existing vitest test on the renderer side, reproduce the contract test before editing production code.
- `systematic-debugging` — when `cargo build` fails with borrow-checker or `Send + Sync` errors (common in Tauri state management), use systematic root-cause analysis before patching symptoms.

## Required Tools

Workers MUST use the MCP tools listed in `AGENTS.md` (Tool Binding Table) for all code lookup and edits. Native tools (`Read`, `Edit`, `Grep`, `Glob`, `Create`) are emergency fallback only and must be logged inline with `// FALLBACK: MCP <tool> failed with <error>; using native <tool> for <path>`.

### Opening move (before any code work)

1. `serena___list_memories()` — list recorded memories; auto-read any whose `memory_name` overlaps tokens in the task.
2. `serena___activate_project("/home/vi/anima")`.
3. `jcodemunch___resolve_repo("/home/vi/anima")` — assert repo id is `"airi"`.
4. `jcodemunch___assemble_task_context(repo="airi", task="<description of the contract or subsystem>")` for auto-classification and anchor extraction.

### Locate target symbols

- `serena___get_symbols_overview(relative_path="<source file>")` — outline of the original electron contract file.
- `serena___find_symbol(name_path_pattern="<symbol>", relative_path="<source file>", include_body=true)` — exact symbol source.
- `jcodemunch___search_units(repo="airi", query="<contract name>", file_pattern="<glob>")` — locate every consumer of a contract before changing it.
- `jcodemunch___get_file(repo="airi", file_path="packages/electron-eventa/src/electron/<file>.ts")` — authoritative contract body.

### Understand impact

- `jcodemunch___get_blast_radius(repo="airi", symbol="<contract symbol id>", depth=2, include_source=true)` — confirm no dangling electron references remain after porting.
- `jcodemunch___get_call_hierarchy(repo="airi", symbol_id="<symbol_id>", direction="both", depth=3)` — confirm callers and callees are intact.
- `jcodemunch___find_references(repo="airi", mode="importers", file_path="<source file>")` — confirm importers will still resolve after the package rename.
- `jcodemunch___get_dependency_graph(repo="airi", file="<source file>", direction="both", depth=2)` — confirm import graph is consistent.

### Apply edit

- `serena___replace_symbol_body(name_path="<qualified name>", relative_path="<target file>", body="<new body>")` — replace a single symbol body.
- `serena___replace_content(relative_path="<target file>", needle="<pattern>", repl="<replacement>", mode="literal" | "regex")` — replace import statements and small snippets.
- `serena___replace_in_files(needle="<pattern>", repl="<replacement>", mode="literal" | "regex", relative_path="<target file or dir>")` — bulk replace across a ported module group.
- `serena___insert_after_symbol` / `serena___insert_before_symbol` — insert new helpers around existing symbols in the Rust or TS modules.
- Native `Create` for new files (`Cargo.toml`, `tauri.conf.json`, new Rust modules) where MCP insert tools need a fixture to anchor against. Log `// FALLBACK: creating new file via Create because no existing symbol exists`.

### Verify and reindex

Rust side:

- `cargo build` in `apps/stage-tauri/` — must end in `Finished` (rewriting CJK source files is permitted to fix modules).
- `cargo clippy --no-deps -- -W clippy::pedantic` — preferred but not blocking; document any new lints as follow-ups.
- `jcodemunch___register_edit(repo="airi", file_paths=["apps/stage-tauri/src/<file.rs>"], reindex=true)` — invalidate cache after Rust edits.

TypeScript side (eventa adapter + composables):

- `pnpm -F @proj-airi/tauri-eventa typecheck` — pass.
- `pnpm -F @proj-airi/tauri-eventa build` — pass (this is the canonical build check for the adapter package).
- `pnpm -F @proj-airi/tauri-vueuse typecheck` — pass.
- `pnpm -F @proj-airi/tauri-vueuse build` — pass.
- `pnpm -F @proj-airi/tauri-vueuse exec vitest run` — run targeted tests when any composable has a test file.
- `serena___get_diagnostics_for_file(relative_path="<target file>", min_severity=2)` — confirm no new warnings or errors.
- `jcodemunch___get_unit(repo="airi", unit_id="<id>", verify=true, verify_against="cache")` — confirm source actually changed.

## Work Procedure

Execute each work unit (one contract group, one Rust module, or one new package) as a discrete step. Do not start the next step until verification passes for the current one.

### Step 0 — Read the contract and mission rules

Re-read:
- `AGENTS.md` (Tool Binding Table, Delegated Code-Change Loop, Architecture Landmines).
- `architecture.md` (System Overview, Window Manager table, IPC Surface inventory).
- `validation-contract.md` (the assertions that will gate this work — every Rust command maps to a `VAL-TAURI-IPC-*` or `VAL-TAURI-SYS-*` assertion).
- This skill's contract inventory tables above.

### Step 1 — Identify the source contract and its Tauri target

For each work unit, identify exactly one of:

- **Adapter module**: source is a `packages/electron-eventa/src/electron/*.ts` contract file. Target is `packages/tauri-eventa/src/contracts/<same-name>.ts` plus the Rust command(s) in `apps/stage-tauri/src/main.rs` (or a dedicated module file).
- **Composable module**: source is a `packages/electron-vueuse/src/composables/use-electron-*.ts` file. Target is `packages/tauri-vueuse/src/composables/use-electron-*.ts` (same name, same export surface, only the import source for `createContext` changes).
- **Rust subsystem**: source is the Electron equivalent (window manager, channel-server, godot-bridge, mcp-bridge, auto-updater). Target is the corresponding Rust module under `apps/stage-tauri/src/`.
- **App config**: `tauri.conf.json` windows table, capabilities JSON, `Cargo.toml`.

If the target file already exists, diff it against the source to scope the remaining changes; never overwrite existing Tauri-specific logic. If the target file does not exist, create it by porting the source: use `jcodemunch___get_file` or `serena___find_symbol(include_body=true)` to read the authoritative source body, then `Create` the target with the ported content (logged fallback).

### Step 2 — Build the substitution plan

For each contract or symbol in the work unit, classify it against the patterns below and prepare a single `{old_text, new_text}` block per change. One substitution per step; never bundle unrelated edits.

### Step 3 — Apply the migration patterns

Apply the patterns in the order listed. Each pattern is a literal → literal (or single regex) replacement via `serena___replace_content` or `serena___replace_in_files`. New-file creation uses native `Create` (logged fallback).

#### Pattern A — eventa Tauri adapter package skeleton

Create `packages/tauri-eventa/` with this shape (mirror `packages/electron-eventa/package.json` but drop `electron` peer dep):

```json
{
  "name": "@proj-airi/tauri-eventa",
  "type": "module",
  "version": "0.10.2",
  "private": true,
  "description": "Shared Eventa contracts for Tauri IPC",
  "exports": {
    ".": "./dist/index.mjs",
    "./tauri": "./dist/tauri/index.mjs",
    "./contracts/window": "./dist/contracts/window.mjs",
    "./contracts/screen": "./dist/contracts/screen.mjs",
    "./contracts/system-preferences": "./dist/contracts/system-preferences.mjs",
    "./contracts/app": "./dist/contracts/app.mjs",
    "./contracts/power-monitor": "./dist/contracts/power-monitor.mjs",
    "./contracts/electron-updater": "./dist/contracts/electron-updater.mjs",
    "./package.json": "./package.json"
  },
  "types": "./dist/index.d.mts",
  "scripts": {
    "dev": "pnpm run build",
    "build": "tsdown",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@moeru/eventa": "catalog:",
    "@moeru/std": "catalog:",
    "builder-util-runtime": "catalog:"
  }
}
```

Add the new workspace to the pnpm catalog at the repo root if necessary. Run `pnpm install` to link the new package before any typecheck.

#### Pattern B — `createContext` Tauri adapter

Create `packages/tauri-eventa/src/tauri/index.ts` exporting two helpers:

```ts
import { createContext } from '@moeru/eventa/adapters/tauri/renderer'
import type { InvokeEventaContext as EventaContext } from '@moeru/eventa'

type TauriIpc = Parameters<typeof createContext>[0]

/** Build an eventa context from a user-supplied Tauri IPC handle. */
export function createContextFromTauriIpc(ipc: TauriIpc): EventaContext {
  return createContext(ipc).context
}

/** Convenience: resolve `window.__TAURI_INTERNALS__.ipc` at call time. */
export function setupTauriEventaContext(window?: { __TAURI_INTERNALS__?: { ipc?: TauriIpc } }): EventaContext {
  const internal = window?.__TAURI_INTERNALS__
  if (!internal?.ipc) {
    throw new Error('Tauri IPC is not available. Ensure @tauri-apps/api is initialised.')
  }
  return createContext(internal.ipc).context
}
```

If `@moeru/eventa/adapters/tauri/renderer` does not exist yet in the installed catalog version, implement the adapter inline as a thin shim that maps `ipc.invoke(channel, ...args)` to eventa's `invoke` and `ipc.on(event, handler)` to eventa's `subscribe`. Re-export so consumers see a stable `createContext` regardless of upstream availability, and file a follow-up to upstream the adapter into `@moeru/eventa`.

#### Pattern C — Re-export contract definitions

For each `packages/electron-eventa/src/electron/<file>.ts`, create `packages/tauri-eventa/src/contracts/<file>.ts` that **re-exports the exact same `defineInvokeEventa` / `defineEventa` definitions**. The simplest correct implementation is a barrel of the upstream file:

```ts
// packages/tauri-eventa/src/contracts/window.ts
export {
  bounds,
  startLoopGetBounds,
  window,
  type VibrancyType,
  type BackgroundMaterialType,
  type ResizeDirection,
} from '@proj-airi/electron-eventa/electron'
```

**Why re-export instead of re-declare?** `defineInvokeEventa` and `defineEventa` produce objects whose identity is used by `defineInvoke(context, contract)` and `context.on(contract, handler)`. If the Tauri and Electron packages each create distinct instances, type-checking passes but `context.on(electronsBounds, ...)` would silently receive nothing because the renderer subscribes via `tauriEventa.window.bounds` and the backend emits via `electronEventa.window.bounds` (different object identities). Re-exporting keeps the identities shared.

If the existing contracts are designed to be string-identity (i.e., they only use `contract.name` for routing, never object identity), re-declaring is acceptable but re-exporting is still safer. Prefer re-export.

The `packages/tauri-eventa/src/index.ts` barrel:

```ts
export { bounds, cursorScreenPoint, startLoopGetBounds, startLoopGetCursorScreenPoint } from './contracts/screen'
export {
  electron,
  electronEvents,
  type BackgroundMaterialType,
  type ResizeDirection,
  type VibrancyType,
} from './contracts'
export { electronAutoUpdaterStateChanged, autoUpdater } from './contracts/electron-updater'
export { createContextFromTauriIpc, setupTauriEventaContext } from './tauri'
```

#### Pattern D — Tauri-vueuse composables

For each `packages/electron-vueuse/src/composables/use-electron-*.ts`, create `packages/tauri-vueuse/src/composables/use-electron-*.ts` that:

- Keeps the **exact same function name and export shape**.
- Replaces the import source `'@proj-airi/electron-eventa'` with `'@proj-airi/tauri-eventa'` (or keeps the electron-eventa import if Pattern C re-exports the same identities from there).
- Replaces `createContext` import source `'@moeru/eventa/adapters/electron/renderer'` with `'@moeru/eventa/adapters/tauri/renderer'`.
- For `use-electron-eventa-context.ts`, the global fallback resolver reads `window.__TAURI_INTERNALS__.ipc` instead of `window.electron.ipcRenderer`.
- For `use-electron-mouse.ts`, the contract names (`cursorScreenPoint`, `startLoopGetCursorScreenPoint`) are unchanged. The Rust side must emit `electron:screen:cursor-screen-point` events with `{ x, y }` payloads.

Package shape (mirror `packages/electron-vueuse/package.json` but rename and drop `electron` peer dep; add `@tauri-apps/api` as needed):

```json
{
  "name": "@proj-airi/tauri-vueuse",
  "type": "module",
  "version": "0.10.2",
  "private": true,
  "description": "VueUse-like composables and helpers for Tauri apps",
  "exports": {
    ".": "./dist/index.mjs",
    "./package.json": "./package.json"
  },
  "types": "./dist/index.d.mts",
  "scripts": {
    "dev": "pnpm run build",
    "build": "tsdown",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "vue": "catalog:vue-gte-3"
  },
  "dependencies": {
    "@moeru/eventa": "catalog:",
    "@moeru/std": "catalog:",
    "@proj-airi/tauri-eventa": "workspace:^",
    "@vueuse/core": "catalog:",
    "es-toolkit": "catalog:",
    "std-env": "catalog:"
  }
}
```

#### Pattern E — Rust command handler

Each Tauri command lives in a Rust module. Read the contract definition, then mirror it as a `#[tauri::command]` async function. Generic template:

```rust
// apps/stage-tauri/src/commands/window.rs
use tauri::{Manager, WebviewWindow};

#[tauri::command]
pub async fn electron_window_get_bounds(window: WebviewWindow) -> Result<Bounds, String> {
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    Ok(Bounds {
        x: pos.x,
        y: pos.y,
        width: size.width as i32,
        height: size.height as i32,
    })
}

#[derive(serde::Serialize)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}
```

Register the command in `main.rs` via `tauri::generate_handler![commands::window::electron_window_get_bounds, ...]`.

For commands that need shared application state (`AppState`), accept a `tauri::State<'_, AppState>` argument. The state type must be `Send + Sync + 'static` and is initialised in `setup` via `app.manage(AppState::new())`.

#### Pattern F — Cross-window event emission

Renderer-facing events (`electron:window:bounds`, `electron:screen:cursor-screen-point`, `electron:auto-updater:state-changed`, `godot:status-changed`, `plugin:updated`) are emitted from Rust. Pattern:

```rust
use tauri::{Emitter, Manager};

// Broadcast to all windows:
window.app_handle().emit("electron:window:bounds", &payload).map_err(|e| e.to_string())?;

// Target one window (e.g., the caption follower):
window.app_handle().emit_to("caption", "electron:window:bounds", &payload).map_err(|e| e.to_string())?;
```

The Rust side often needs to poll window state and emit on change. Spawn a polling loop in `setup`:

```rust
tauri::async_runtime::spawn(async move {
    let mut last = None;
    loop {
        let win = app_handle.get_webview_window("main").ok_or(()).unwrap();
        let pos = win.outer_position().ok();
        let size = win.outer_size().ok();
        let cur = pos.zip(size);
        if cur != last {
            last = cur;
            let _ = app_handle.emit("electron:window:bounds", bounds_to_payload(cur));
        }
        tokio::time::sleep(Duration::from_millis(16)).await;
    }
});
```

#### Pattern G — Tauri app scaffold (`Cargo.toml` + `main.rs`)

`apps/stage-tauri/Cargo.toml` dependencies (Tauri v2 stable, no nightly features):

```toml
[package]
name = "airi-tauri"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png"] }
tauri-plugin-single-instance = "2"
tauri-plugin-window-state = "2"
tauri-plugin-store = "2"
tauri-plugin-fs = "2"
tauri-plugin-shell = "2"
tauri-plugin-opener = "2"
tauri-plugin-updater = "2"
tauri-plugin-global-shortcut = "2"
tauri-plugin-dialog = "2"
tauri-plugin-notification = "2"
tauri-plugin-autostart = "2"
tauri-plugin-clipboard-manager = "2"
tauri-plugin-http = "2"
tokio = { version = "1", features = ["full"] }
tokio-rustls = { version = "0.26", features = ["ring"] }
rcgen = "0.13"
h3 = "0.7"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
evdev = "0.12"
```

`main.rs` structure:

1. `tauri::Builder::default().plugin(...)` registration for every plugin listed.
2. `.manage(AppState::new())` for shared state.
3. `.setup(|app| { ... })` block spawning the channel server, godot bridge, mcp bridge, and per-window hitbox threads via `tauri::async_runtime::spawn`.
4. `.invoke_handler(tauri::generate_handler![ ... ])` listing every Rust command the renderer can call.
5. `.on_window_event(...)` for window lifecycle translates to `electron:window:lifecycle-changed` events.
6. System tray setup via `tauri::tray::TrayIconBuilder` and `tauri::menu::MenuItem`.
7. `.run(tauri::generate_context!())`.

#### Pattern H — Tauri.conf.json windows

Mirror the window manager table from `architecture.md`:

| Window key | transparent | decorations | alwaysOnTop | skipTaskbar | focusable |
|---|---|---|---|---|---|
| `main` | true | false | true | false | true |
| `chat` | false | true | false | false | true |
| `settings` | false | true | false | false | true |
| `widgets` | true | false | false | false | true |
| `caption` | true | false | false | false | false (hitbox-driven) |
| `beat-sync` | false | true | false | true | false |
| `inlay` | true | false | false | false | false |
| `desktop-overlay` | true | false | true | true | false |
| `about`, `notice`, `devtools`, `onboarding` | false | true | false | false | true |
| `dashboard` | true | true | false | false | true |

`desktop-overlay` is gated behind `AIRI_DESKTOP_OVERLAY=1` in `setup`; do not declare it in the static windows array unless guarded.

#### Pattern I — Channel server (`src/channel-server.rs`)

Ingredients:
- `h3` router with `/health` and WebSocket routes.
- `tokio-rustls` listener with a self-signed cert from `rcgen`.
- Cert material is generated on first launch (idempotent), stored under `app_data_dir()/certs/`, and re-used if present.
- Spawned in `setup` as a long-lived task: `tauri::async_runtime::spawn(channel_server(app_handle.clone()))`.
- The task binds a dynamic port and reports the port back to the renderer via `electron:server-channel:status-changed` (a new contract; coordinate with the orchestrator if it does not yet exist).
- Health-check endpoint returns `200 OK` with JSON.

Sample skeleton:

```rust
pub async fn start_channel_server(app: tauri::AppHandle) {
    let data_dir = app.path().app_data_dir().expect("app_data_dir");
    let cert_path = data_dir.join("certs");
    let (cert, key) = ensure_cert(&cert_path).await;
    let port = pick_port();
    let listener = bind_tls(port, &cert, &key).await;
    let mut app_router = h3::Router::new().route("/health", h3::get(health));
    serve(listener, app_router).await;
}
```

`rcgen` snippet:

```rust
use rcgen::{CertificateParams, DistinguishedName, KeyPair, PKCS_ECDSA_P256_SHA256};

fn gen_self_signed() -> (String /*cert pem*/, String /*key pem*/) {
    let mut params = CertificateParams::new(vec!["localhost".into()]);
    params.distinguished_name = DistinguishedName::new();
    let key = KeyPair::generate_for(&PKCS_ECDSA_P256_SHA256).unwrap();
    let cert = params.self_signed(&key).unwrap();
    (cert.pem(), key.serialize_pem())
}
```

#### Pattern J — MCP bridge (`src/mcp-bridge.rs`)

Ingredients:
- Reads `<app_data_dir>/mcp.json` listing stdio MCP servers (command, env, args).
- Spawns each via `tokio::process::Command::new(cmd).args(args).stdin(piped).stdout(piped).spawn()`.
- Holds a `HashMap<ServerId, McpChild>` in application state.
- Exposes WebSocket bridge on a random port: the renderer speaks JSON-RPC over WS; the bridge forwards to the child's stdin/stdout.
- Health monitoring: every N seconds, ping each child; mark as `degraded` if non-responsive.
- Rust commands exposed to renderer: `mcp_list_tools`, `mcp_call_tool`, `mcp_get_runtime_status`, `mcp_apply_and_restart`, `mcp_read_config`, `mcp_write_config`, `mcp_test_server`, `mcp_open_config_file`.
- Spawned as a long-lived task in `setup`.

#### Pattern K — Godot bridge (`src/godot-bridge.rs`)

Ingredients:
- Spawns the Godot binary via `tauri-plugin-shell`: `tauri::process::Command::new_sidecar("godot-stage")`. The sidecar is declared under `tauri.conf.json > bundle.externalBin`.
- Maintains a WebSocket bridge on a random port; the Godot side must talk WS (existing protocol).
- Exposes Rust commands: `godot_start`, `godot_stop`, `godot_get_status`, `godot_apply_scene_input`, `godot_request_snapshot`.
- Emits `godot:status-changed`, `godot:view-snapshot-changed`, `godot:view-state-error` events via `emit_all`.
- Spawned in `setup` only when the sidecar binary is resolvable; if not, mark `godot_get_status` to return `"unavailable"` and emit a `degraded` event once.

#### Pattern L — Hitbox thread (Linux, `/dev/input/event*`)

Spawned per transparent-click-through-enabled window. Lifecycle:

```rust
pub fn spawn_hitbox_thread(window: WebviewWindow) -> std::thread::JoinHandle<()> {
    let label = window.label().to_string();
    let app = window.app_handle().clone();
    std::thread::spawn(move || {
        // open /dev/input/event* readers via `evdev::Stream::new().unwrap()`
        let mut streams = evdev::Stream::new().unwrap();
        let mut last_emitted = Instant::now();
        for ev in streams.iter() {
            if let evdev::Event::MouseMove{ x, y } = ev {
                if last_emitted.elapsed() >= Duration::from_millis(16) {
                    let _ = app.emit_to(&label, "device-mouse-move", Move { x, y });
                    last_emitted = Instant::now();
                }
            }
        }
    })
}
```

Store the join handles in `tauri::State<'_, HitboxThreads>` (a `Mutex<HashMap<String, JoinHandle<()>>>`). On `WindowEvent::Destroyed`, signal the thread to exit (drop a sender or set a `should_exit: Arc<AtomicBool>`).

Document the lifecycle at each spawn site: which window, what exit signal, where the handle is tracked.

### Step 4 — Verify the work unit (mandatory, never skip)

Run the following in order for every work unit:

1. `jcodemunch___get_unit(repo="airi", unit_id="<contract or symbol id>", verify=true, verify_against="cache")` — confirm source actually changed.
2. `jcodemunch___get_blast_radius(repo="airi", symbol="<id>", include_source=true)` — confirm no dangling electron references remain.
3. `jcodemunch___get_call_hierarchy(repo="airi", symbol_id="<id>", direction="callers")` — confirm callers intact.
4. `jcodemunch___register_edit(repo="airi", file_paths=[...], reindex=true)` — invalidate cache.
5. `serena___get_diagnostics_for_file(relative_path="<target file>", min_severity=2)` — confirm no new warnings or errors (TS).
6. `pnpm -F @proj-airi/tauri-eventa typecheck` and `pnpm -F @proj-airi/tauri-eventa build` — verify the adapter builds.
7. `pnpm -F @proj-airi/tauri-vueuse typecheck` and `pnpm -F @proj-airi/tauri-vueuse build` — verify the composables build.
8. `cd apps/stage-tauri && cargo build` — verify Rust compiles (must end in `Finished`).
9. `pnpm -F @proj-airi/tauri-vueuse exec vitest run <changed-file>` — run targeted tests, if any exist for the file.

If any verification step fails, re-issue the failing substitution with corrective feedback. Do not proceed to the next work unit until all steps pass.

### Step 5 — Report

Return the structured report described in "When to Return to the Orchestrator" below.

## Components Known to Be Affected

This skill owns the Rust + adapter side of the port. Renderer consumers of the contracts are owned by the `renderer-migration-worker` skill. Movement boundaries:

- **This skill touches**: `packages/tauri-eventa/**`, `packages/tauri-vueuse/**`, `apps/stage-tauri/src/**/*.rs`, `apps/stage-tauri/Cargo.toml`, `apps/stage-tauri/tauri.conf.json`, `apps/stage-tauri/capabilities/*.json`.
- **This skill reads but does not modify**: `packages/electron-eventa/src/**`, `packages/electron-vueuse/src/**`, `apps/stage-tamagotchi/**` (reference only).
- **This skill coordinates with `renderer-migration-worker`**: when a new contract must be added to support a renderer feature that doesn't yet exist on either side, return `needs-coordination` rather than adding it unilaterally — the contracts list must stay in sync.

Shared stores that depend on the contracts (impact awareness, but edits owned by the renderer-migration-worker skill):

- `packages/stage-ui/stores/mcp-tools.ts`
- `packages/stage-ui/stores/plugin-tools.ts`
- `packages/stage-ui/stores/stage-window-lifecycle.ts`
- `packages/stage-ui/stores/settings/server-channel.ts`
- `packages/stage-ui/stores/window.ts`

This list is non-exhaustive. When handed a contract, classify it against Patterns A-L regardless of whether it appears above.

## Example Handoff

The orchestrator hands off a single work unit as a JSON object. The worker returns the same shape with `status`, `verifications`, and `notes` filled in.

Request (from orchestrator):

```json
{
  "work_unit_id": "ipc-window-001",
  "kind": "rust-command",
  "contract_id": "eventa:invoke:electron:window:get-bounds",
  "source_file": "packages/electron-eventa/src/electron/window.ts",
  "target_file": "apps/stage-tauri/src/commands/window.rs",
  "adapter_target": "packages/tauri-eventa/src/contracts/window.ts",
  "patterns_expected": ["pattern-a-package-skeleton", "pattern-c-re-export", "pattern-e-rust-command"],
  "context": {
    "blast_radius_notes": "Window contract is imported by use-electron-window-bounds and use-electron-relative-mouse. Both stay opaque.",
    "call_chain": "useElectronWindowBounds -> defineInvoke(context, window.getBounds) -> Rust electron_window_get_bounds",
    "lessons_learned": "Re-export contract identities from tauri-eventa so .on() subscriptions remain object-identity-stable."
  }
}
```

Response (from worker):

```json
{
  "work_unit_id": "ipc-window-001",
  "contract_id": "eventa:invoke:electron:window:get-bounds",
  "status": "completed",
  "patterns_applied": ["pattern-a-package-skeleton", "pattern-c-re-export", "pattern-e-rust-command"],
  "files_created": [
    "apps/stage-tauri/src/commands/window.rs",
    "packages/tauri-eventa/src/contracts/window.ts"
  ],
  "files_modified": [
    "apps/stage-tauri/src/main.rs",
    "apps/stage-tauri/Cargo.toml",
    "packages/tauri-eventa/package.json",
    "packages/tauri-eventa/src/index.ts"
  ],
  "rust_command_name": "electron_window_get_bounds",
  "rust_signature": "async fn electron_window_get_bounds(window: WebviewWindow) -> Result<Bounds, String>",
  "verifications": {
    "get_unit_verify": "ok",
    "blast_radius": "no dangling electron references",
    "call_hierarchy_callers": "useElectronWindowBounds, useElectronRelativeMouse callers intact",
    "register_edit": "ok",
    "diagnostics": "no new warnings",
    "tauri_eventa_typecheck": "passed",
    "tauri_eventa_build": "passed",
    "tauri_vueuse_typecheck": "passed",
    "tauri_vueuse_build": "passed",
    "cargo_build": "Finished",
    "vitest": "no tests for this contract"
  },
  "notes": [
    "Bounds struct derives serde::Serialize; field order matches electrons Rectangle.",
    "set_ignore_cursor_events is a separate work unit (ipc-window-002) because of the forward-flag regression and hitbox thread."
  ],
  "follow_ups": []
}
```

A realistic example of a fully-ported composable body is shown below. Before (Electron — `packages/electron-vueuse/src/composables/use-electron-eventa-context.ts`):

```ts
import { createContext } from '@moeru/eventa/adapters/electron/renderer'

function resolveIpcRenderer(): IpcRendererLike {
  const g = (globalThis as any).window?.electron?.ipcRenderer
  if (!g) throw new Error('Electron ipcRenderer is not available.')
  return g
}
```

After (Tauri — `packages/tauri-vueuse/src/composables/use-electron-eventa-context.ts`):

```ts
import { createContext } from '@moeru/eventa/adapters/tauri/renderer'

function resolveTauriIpc(): TauriIpcLike {
  const internal = (globalThis as any).window?.__TAURI_INTERNALS__
  if (!internal?.ipc) {
    throw new Error('Tauri IPC is not available. Ensure @tauri-apps/api is initialised.')
  }
  return internal.ipc
}
```

The composable name `useElectronEventaContext` is preserved on purpose (downstream consumers depend on it). A co-located alias `useTauriEventaContext` MAY be exported as a thin re-export for ergonomics, but it MUST NOT replace the electronprefixed name.

## When to Return to the Orchestrator

Return control to the orchestrator and stop work immediately in any of the following cases:

1. **Work unit complete.** All patterns have been applied, all verification steps pass (`cargo build`, `pnpm -F @proj-airi/tauri-eventa build`, typecheck, tests), and the structured report (see "Example Handoff") has been produced. Hand back the report JSON.

2. **Contract gap detected.** The renderer invokes a contract that does not yet exist on the Electron side (i.e., a new feature). Do not invent the contract; return `status: "needs-coordination"` with the proposed contract ID, payload shape, and the renderer consumer that needs it. The orchestrator decides whether to add the contract to both eventa packages and the Rust backend atomically.

3. **Verification failure that cannot be self-corrected.** A substitution was applied, but one of the mandatory verification steps fails and a second corrective attempt also fails. Return `status: "blocked"` with `notes` attaching the failing verification output (cargo / pnpm / typecheck / vitest), and list the failing step in `follow_ups`.

4. **Cross-skill dependency discovered.** Implementing a Rust command requires a coordinated renderer change that is owned by `renderer-migration-worker` (e.g., a contract must be renamed, and every importer must be updated atomically). Do not touch the renderer file. Return `status: "needs-coordination"`, name the dependent file in `follow_ups`, and let the orchestrator schedule the dependent port.

5. **Tauri API unavailability.** A needed Tauri v2 API does not exist (e.g., the harness targets Tauri v2.0 which lacks some plugins) or the nightly feature is required. Do not enable nightly features. Return `status: "blocked"` with the missing API name and a proposed alternative (or "drop the feature" recommendation) in `notes`.

6. **Missing source or target.** The source file does not exist under `packages/electron-eventa/` or `packages/electron-vueuse/`, or the target path under `apps/stage-tauri/` or `packages/tauri-{eventa,vueuse}/` is not writable. Return `status: "blocked"` with the reason in `notes`.

7. **Ambiguous ownership.** A file is claimed by another worker skill (e.g., `tauri-window-worker` owns multi-window config; `tauri-sidecar-worker` owns Godot/MCP delivery). If the work unit straddles the boundary, return `status: "needs-coordination"` and name the overlapping skill. A heuristic:
   - Pure IPC routing, adapter mirroring, contracts re-export → **this skill**.
   - Window geometry, transparency, click-through hitbox visuals → `tauri-window-worker` (but the hitbox Rust thread itself lives in this skill).
   - Godot/MCP/plugin-host sidecar lifecycle and protocol → `tauri-sidecar-worker` (the IPC command shells live in this skill).

In all return cases, the worker MUST:

- Stop editing immediately after producing the report.
- Not begin work on the next work unit in the queue.
- Not modify files owned by another worker skill (coordinate instead).
- Include the full structured report JSON in the response so the orchestrator can record it.

## Validation Hooks

Assertions that this skill's output feeds (see `validation-contract.md`):

- `VAL-TAURI-SYS-001` — `cargo build` `Finished` line.
- `VAL-TAURI-SYS-002` — `cargo tauri dev` launches within 30 s.
- `VAL-TAURI-SYS-004` — `window_get_bounds` returns live `{ x, y, width, height }`.
- `VAL-TAURI-SYS-005` — `electron:window:lifecycle-changed` fires on minimize/restore.
- `VAL-TAURI-IPC-001` — `createContext(window.__TAURI_INTERNALS__.ipc).context` is non-null.
- `VAL-TAURI-IPC-002` — every eventa invoke contract routes to a Rust command without `not found` errors.
- `VAL-TAURI-IPC-003` — event subscriptions (`electron:screen:cursor-screen-point`, `electron:window:bounds`, `electron:auto-updater:state-changed`) deliver payloads.
- `VAL-TAURI-IPC-004` — cross-window events propagate via `emit_all` / `emit_to`.
- `VAL-TAURI-SRV-001` — channel server `/health` returns 200.
- `VAL-TAURI-SRV-002` — server-channel QR code renders.
- `VAL-TAURI-SRV-004` — Godot sidecar spawns (or returns `available` when the binary is present).
- `VAL-TAURI-SRV-005` — MCP server list loads via `mcp_list_tools`.
- `VAL-TAURI-UPD-002` — `auto_updater_check_for_updates` returns state to the renderer.
- `VAL-TAURI-OVRL-001` — hitbox thread spawns for click-through windows; emits `device-mouse-move`.

Map each work unit's report to the assertions it satisfies, so the orchestrator can update the validation matrix incrementally.
