# App Lifecycle Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Tauri tray quit/show behavior and persist the main window geometry/transparency across app restarts.

**Architecture:** Keep lifecycle policy in a new Rust module, `apps/stage-tauri/src/app_lifecycle.rs`, so persistence, tray menu behavior, and shutdown paths are not buried in `main.rs`. Store a compact JSON file under Tauri's app data directory and restore it during setup before applying cursor-display fallback placement. Use the existing Tauri tray/menu APIs already enabled by the `tray-icon` feature.

**Tech Stack:** Rust 2021, Tauri 2.11, serde/serde_json, existing Stage Tauri unit tests, native Tauri tray/menu/window APIs.

## Global Constraints

- Work in `/home/vi/anima/.worktrees/app-lifecycle-persistence` on `vi/feat/app-lifecycle-persistence`.
- AGENTS.md MCP tools are unavailable in this session; native CLI fallback must be listed in the final summary.
- Do not add dependencies unless the existing standard library/Tauri APIs are insufficient.
- Use TDD for behavior changes: write failing Rust tests before production code.
- Preserve current display placement behavior when no valid persisted state exists.
- Close and tray quit both fully exit the app after persisting state; no hide-to-tray behavior for this mission feature.
- Do not edit unrelated pre-existing untracked files in the main checkout.

---

## File Structure

- Create `apps/stage-tauri/src/app_lifecycle.rs`: persistence data types, JSON read/write helpers, main-window state capture/apply functions, tray setup, close/quit wiring, and unit tests for pure helpers.
- Modify `apps/stage-tauri/src/main.rs`: register `mod app_lifecycle`, call lifecycle setup during `setup`, and keep existing event emitters unchanged.
- Modify `apps/stage-tauri/src/window_manager.rs`: let persisted state restore run before cursor-display placement; keep existing `apply_main_window_display_features` as fallback policy.
- Modify `apps/stage-tauri/src/commands/app.rs`: route `electron_app_quit` through lifecycle persistence before `app.exit(0)`.
- Modify mission ledger files under `docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/` after implementation.

## Task 1: Window State Data And Validation

**Files:**
- Create: `apps/stage-tauri/src/app_lifecycle.rs`

**Interfaces:**
- Produces: `PersistedMainWindowState`, `WindowGeometry`, `valid_geometry`, `merge_saved_state`, `window_state_file_name`.
- Consumes: only `serde` and standard library in this task.

- [ ] **Step 1: Write failing tests**

Add `app_lifecycle.rs` with tests first:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unusable_window_geometry() {
        assert!(!valid_geometry(&WindowGeometry { x: 0.0, y: 0.0, width: 0.0, height: 720.0 }));
        assert!(!valid_geometry(&WindowGeometry { x: 0.0, y: 0.0, width: 480.0, height: 0.0 }));
        assert!(!valid_geometry(&WindowGeometry { x: f64::NAN, y: 0.0, width: 480.0, height: 720.0 }));
        assert!(valid_geometry(&WindowGeometry { x: 10.0, y: 20.0, width: 480.0, height: 720.0 }));
    }

    #[test]
    fn keeps_configured_transparency_when_saved_state_omits_it() {
        let fallback = PersistedMainWindowState {
            geometry: None,
            transparent: true,
        };
        let saved = PersistedMainWindowState {
            geometry: Some(WindowGeometry { x: 10.0, y: 20.0, width: 640.0, height: 480.0 }),
            transparent: false,
        };

        assert_eq!(
            merge_saved_state(Some(saved), fallback),
            PersistedMainWindowState {
                geometry: Some(WindowGeometry { x: 10.0, y: 20.0, width: 640.0, height: 480.0 }),
                transparent: false,
            }
        );
        assert_eq!(
            merge_saved_state(None, fallback),
            PersistedMainWindowState {
                geometry: None,
                transparent: true,
            }
        );
    }
}
```

- [ ] **Step 2: Run tests to verify RED**

Run: `cargo test --manifest-path apps/stage-tauri/Cargo.toml app_lifecycle`

Expected: compile failure because `app_lifecycle` module/types/functions are not wired yet.

- [ ] **Step 3: Add minimal implementation**

Implement serializable data types and pure helpers:

```rust
use serde::{Deserialize, Serialize};

pub(crate) const MAIN_WINDOW_LABEL: &str = "main";
const WINDOW_STATE_FILE: &str = "main-window-state.json";

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WindowGeometry {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) width: f64,
    pub(crate) height: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistedMainWindowState {
    pub(crate) geometry: Option<WindowGeometry>,
    pub(crate) transparent: bool,
}

pub(crate) fn window_state_file_name() -> &'static str {
    WINDOW_STATE_FILE
}

pub(crate) fn valid_geometry(geometry: &WindowGeometry) -> bool {
    geometry.x.is_finite()
        && geometry.y.is_finite()
        && geometry.width.is_finite()
        && geometry.height.is_finite()
        && geometry.width >= 100.0
        && geometry.height >= 100.0
}

pub(crate) fn merge_saved_state(
    saved: Option<PersistedMainWindowState>,
    fallback: PersistedMainWindowState,
) -> PersistedMainWindowState {
    saved.unwrap_or(fallback)
}
```

- [ ] **Step 4: Wire module and verify GREEN**

Add `mod app_lifecycle;` to `apps/stage-tauri/src/main.rs`.

Run: `cargo test --manifest-path apps/stage-tauri/Cargo.toml app_lifecycle`

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/stage-tauri/src/app_lifecycle.rs apps/stage-tauri/src/main.rs
git commit -m "feat(stage-tauri): add lifecycle state model" \
  -m "Tests: cargo test --manifest-path apps/stage-tauri/Cargo.toml app_lifecycle"
```

## Task 2: Persist And Restore Main Window Geometry

**Files:**
- Modify: `apps/stage-tauri/src/app_lifecycle.rs`
- Modify: `apps/stage-tauri/src/window_manager.rs`
- Modify: `apps/stage-tauri/src/main.rs`

**Interfaces:**
- Consumes: Task 1 data types.
- Produces: `read_main_window_state_from_path`, `write_main_window_state_to_path`, `capture_main_window_state`, `restore_main_window_state`, `persist_main_window_state`, `setup_main_window_close_persistence`.

- [ ] **Step 1: Write failing serialization tests**

Add tests:

```rust
#[test]
fn round_trips_window_state_json() {
    let path = unique_test_path("round-trip");
    let state = PersistedMainWindowState {
        geometry: Some(WindowGeometry { x: 11.0, y: 22.0, width: 640.0, height: 480.0 }),
        transparent: true,
    };

    write_main_window_state_to_path(&path, state).unwrap();

    assert_eq!(read_main_window_state_from_path(&path).unwrap(), Some(state));
    let _ = std::fs::remove_file(path);
}

#[test]
fn ignores_malformed_window_state_json() {
    let path = unique_test_path("malformed");
    std::fs::write(&path, "{not-json").unwrap();

    assert_eq!(read_main_window_state_from_path(&path).unwrap(), None);
    let _ = std::fs::remove_file(path);
}
```

Add helper in the test module:

```rust
fn unique_test_path(name: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "airi-tauri-{name}-{}-{}.json",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ))
}
```

- [ ] **Step 2: Run tests to verify RED**

Run: `cargo test --manifest-path apps/stage-tauri/Cargo.toml app_lifecycle`

Expected: compile failure for missing read/write functions.

- [ ] **Step 3: Implement JSON read/write helpers**

Add:

```rust
use std::path::{Path, PathBuf};

pub(crate) fn read_main_window_state_from_path(
    path: &Path,
) -> Result<Option<PersistedMainWindowState>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    match serde_json::from_slice::<PersistedMainWindowState>(&bytes) {
        Ok(state) => Ok(Some(state)),
        Err(_) => Ok(None),
    }
}

pub(crate) fn write_main_window_state_to_path(
    path: &Path,
    state: PersistedMainWindowState,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(&state).map_err(|e| e.to_string())?;
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}
```

- [ ] **Step 4: Verify serialization tests GREEN**

Run: `cargo test --manifest-path apps/stage-tauri/Cargo.toml app_lifecycle`

Expected: app lifecycle tests pass.

- [ ] **Step 5: Add runtime capture/restore**

Implement runtime helpers in `app_lifecycle.rs`:

```rust
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewWindow, WindowEvent};

fn default_main_window_state() -> PersistedMainWindowState {
    PersistedMainWindowState {
        geometry: None,
        transparent: true,
    }
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_data_dir.join(window_state_file_name()))
}

pub(crate) fn capture_main_window_state(window: &WebviewWindow) -> Result<PersistedMainWindowState, String> {
    let scale_factor = window.scale_factor().map_err(|e| e.to_string())?;
    let scale_factor = if scale_factor > 0.0 { scale_factor } else { 1.0 };
    let position = window
        .outer_position()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale_factor);
    let size = window
        .outer_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(scale_factor);

    Ok(PersistedMainWindowState {
        geometry: Some(WindowGeometry {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        }),
        transparent: true,
    })
}

pub(crate) fn persist_main_window_state(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };
    let state = capture_main_window_state(&window)?;
    write_main_window_state_to_path(&state_path(app)?, state)
}

pub(crate) fn restore_main_window_state(app: &AppHandle) -> Result<bool, String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(false);
    };

    let state = merge_saved_state(
        read_main_window_state_from_path(&state_path(app)?)?,
        default_main_window_state(),
    );

    let Some(geometry) = state.geometry else {
        return Ok(false);
    };
    if !valid_geometry(&geometry) {
        return Ok(false);
    }

    window
        .set_size(LogicalSize::new(geometry.width, geometry.height))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(geometry.x, geometry.y))
        .map_err(|e| e.to_string())?;
    Ok(true)
}

pub(crate) fn setup_main_window_close_persistence(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    let handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed) {
            let _ = persist_main_window_state(&handle);
        }
    });
}
```

- [ ] **Step 6: Apply restore before display fallback**

Modify `apply_main_window_display_features` in `window_manager.rs` so it accepts `skip_cursor_positioning: bool` or create a new wrapper in `main.rs`:

```rust
let restored = app_lifecycle::restore_main_window_state(&handle).unwrap_or(false);
if !restored {
    if let Err(error) = window_manager::apply_main_window_display_features(&handle) {
        eprintln!("failed to apply main window display features: {error}");
    }
} else if let Some(window) = handle.get_webview_window("main") {
    if let Err(error) = window.set_always_on_top(true) {
        eprintln!("failed to reassert always-on-top: {error}");
    }
}
app_lifecycle::setup_main_window_close_persistence(&handle);
```

- [ ] **Step 7: Verify runtime integration**

Run:

```bash
cargo fmt --manifest-path apps/stage-tauri/Cargo.toml --check
cargo test --manifest-path apps/stage-tauri/Cargo.toml app_lifecycle
cargo test --manifest-path apps/stage-tauri/Cargo.toml
cargo build --manifest-path apps/stage-tauri/Cargo.toml
```

Expected: Rust formatting, tests, and build pass with only known placeholder warnings.

- [ ] **Step 8: Commit**

```bash
git add apps/stage-tauri/src/app_lifecycle.rs apps/stage-tauri/src/main.rs apps/stage-tauri/src/window_manager.rs
git commit -m "feat(stage-tauri): persist main window geometry" \
  -m "Tests: cargo fmt --manifest-path apps/stage-tauri/Cargo.toml --check; cargo test --manifest-path apps/stage-tauri/Cargo.toml; cargo build --manifest-path apps/stage-tauri/Cargo.toml"
```

## Task 3: Tray Menu And Quit Path

**Files:**
- Modify: `apps/stage-tauri/src/app_lifecycle.rs`
- Modify: `apps/stage-tauri/src/main.rs`
- Modify: `apps/stage-tauri/src/commands/app.rs`

**Interfaces:**
- Consumes: `persist_main_window_state`.
- Produces: `setup_tray`, `quit_after_persisting`, `TRAY_SHOW_ID`, `TRAY_QUIT_ID`.

- [ ] **Step 1: Write failing menu id tests**

Add:

```rust
#[test]
fn tray_menu_ids_are_stable() {
    assert_eq!(TRAY_SHOW_ID, "show-airi");
    assert_eq!(TRAY_QUIT_ID, "quit-airi");
}
```

- [ ] **Step 2: Run tests to verify RED**

Run: `cargo test --manifest-path apps/stage-tauri/Cargo.toml app_lifecycle`

Expected: compile failure for missing tray id constants.

- [ ] **Step 3: Implement tray ids, tray setup, show, and quit**

Add:

```rust
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
};

pub(crate) const TRAY_SHOW_ID: &str = "show-airi";
pub(crate) const TRAY_QUIT_ID: &str = "quit-airi";

pub(crate) fn show_main_window(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };
    if window.is_minimized().unwrap_or(false) {
        window.unminimize().map_err(|e| e.to_string())?;
    }
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn quit_after_persisting(app: &AppHandle) {
    let _ = persist_main_window_state(app);
    app.exit(0);
}

pub(crate) fn setup_tray(app: &AppHandle) -> Result<(), String> {
    let show = MenuItemBuilder::with_id(TRAY_SHOW_ID, "Show AIRI")
        .build(app)
        .map_err(|e| e.to_string())?;
    let quit = MenuItemBuilder::with_id(TRAY_QUIT_ID, "Quit")
        .build(app)
        .map_err(|e| e.to_string())?;
    let menu = MenuBuilder::new(app)
        .items(&[&show, &quit])
        .build()
        .map_err(|e| e.to_string())?;

    TrayIconBuilder::new()
        .tooltip("AIRI")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_SHOW_ID => {
                let _ = show_main_window(app);
            }
            TRAY_QUIT_ID => quit_after_persisting(app),
            _ => {}
        })
        .build(app)
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 4: Wire setup and app quit command**

In `main.rs` setup, call:

```rust
if let Err(error) = app_lifecycle::setup_tray(&handle) {
    eprintln!("failed to setup tray: {error}");
}
```

Change `electron_app_quit` in `commands/app.rs`:

```rust
#[tauri::command]
pub async fn electron_app_quit(app: AppHandle) {
    crate::app_lifecycle::quit_after_persisting(&app);
}
```

- [ ] **Step 5: Verify**

Run:

```bash
cargo fmt --manifest-path apps/stage-tauri/Cargo.toml --check
cargo test --manifest-path apps/stage-tauri/Cargo.toml app_lifecycle
cargo test --manifest-path apps/stage-tauri/Cargo.toml
cargo build --manifest-path apps/stage-tauri/Cargo.toml
```

Expected: Rust formatting, tests, and build pass with only known placeholder warnings.

- [ ] **Step 6: Commit**

```bash
git add apps/stage-tauri/src/app_lifecycle.rs apps/stage-tauri/src/main.rs apps/stage-tauri/src/commands/app.rs
git commit -m "feat(stage-tauri): add tray quit lifecycle" \
  -m "Tests: cargo fmt --manifest-path apps/stage-tauri/Cargo.toml --check; cargo test --manifest-path apps/stage-tauri/Cargo.toml; cargo build --manifest-path apps/stage-tauri/Cargo.toml"
```

## Task 4: Mission Ledger And Final Verification

**Files:**
- Modify: `docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/state.json`
- Modify: `docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/progress_log.jsonl`
- Modify: `docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/features.json`
- Modify: `docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/validation-state.json`

**Interfaces:**
- Consumes: implementation commit ids and verification outputs.
- Produces: mission handoff state for `app-lifecycle-persistence`.

- [ ] **Step 1: Run final verification**

Run:

```bash
cargo fmt --manifest-path apps/stage-tauri/Cargo.toml --check
cargo test --manifest-path apps/stage-tauri/Cargo.toml
cargo build --manifest-path apps/stage-tauri/Cargo.toml
pnpm -F @proj-airi/stage-tauri typecheck
git diff --check
```

Expected:
- Rust commands pass with known placeholder warnings.
- `pnpm -F @proj-airi/stage-tauri typecheck` may still fail on existing `@proj-airi/server-sdk`/`stage-ui` type export drift; record exact output if it does.

- [ ] **Step 2: Update mission files**

Set `app-lifecycle-persistence` status to `completed` or `implementation-complete-runtime-evidence-pending` depending on whether runtime tray/quit screenshots and no-orphan process checks were captured.

Append a `worker_completed` or `orchestrator_progress_updated` JSONL entry with:
- implementation commit id,
- verification commands and exit codes,
- known TypeScript baseline issue if still present,
- runtime evidence captured or pending,
- MCP fallback note.

- [ ] **Step 3: Validate JSON**

Run:

```bash
jq . docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/state.json >/dev/null
jq . docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/features.json >/dev/null
jq . docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/validation-state.json >/dev/null
tail -n 1 docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/progress_log.jsonl | jq . >/dev/null
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit docs**

```bash
git add docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e
git commit -m "docs(mission): record lifecycle persistence feature" \
  -m "Tests: jq . docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/state.json >/dev/null; jq . docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/features.json >/dev/null; jq . docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/validation-state.json >/dev/null; tail -n 1 docs/missions/d74b01dc-52da-4992-8a61-ea0a07bd800e/progress_log.jsonl | jq . >/dev/null; git diff --check"
```

## Self-Review

- Spec coverage: tray icon/menu/quit is Task 3; no orphan process behavior is covered by full app exit after persisting; main window geometry/transparency persistence is Task 2; mission ledger is Task 4.
- Placeholder scan: no placeholder tokens are present in the plan.
- Type consistency: `PersistedMainWindowState`, `WindowGeometry`, `persist_main_window_state`, `restore_main_window_state`, `setup_tray`, and `quit_after_persisting` are defined before later tasks consume them.
