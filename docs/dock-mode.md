## AIRI Dock Mode (Windows + macOS) — Design + PoC Plan

This document describes a cross-platform Dock Mode for AIRI that keeps an AIRI overlay window visually attached to a user-selected target window. The design favors transparency overlays and a strict visibility contract over reparenting. No private APIs are used.

### Goals and Scope
- Opt-in Dock Mode that follows one explicit target window.
- Overlay is AIRI-owned (transparent, borderless, click-through) that tracks target bounds; no foreign window reparenting.
- Visibility contract: overlay only shows when target is the frontmost real window, not fullscreen, and is on-screen.
- Degrade gracefully without macOS Accessibility permission; polling-based Core Graphics baseline, AX events as an additive optimization.
- Platform parity for Windows + macOS with testable state machine and devtools.

### Key References
- electron-overlay-window: <https://github.com/SnosMe/electron-overlay-window>
- electron-overlay-window macOS support PR: <https://github.com/SnosMe/electron-overlay-window/pull/17>
- electron-overlay-window macOS fullscreen issue: <https://github.com/SnosMe/electron-overlay-window/issues/37>
- awakened-poe-trade macOS overlay PR: <https://github.com/SnosMe/awakened-poe-trade/pull/403>
- Electron alwaysOnTop vs macOS fullscreen (wontfix): <https://github.com/electron/electron/issues/10078>
- CoreGraphics window APIs: `CGWindowListCopyWindowInfo`, `optionOnScreenAboveWindow`, `optionOnScreenOnly`, `excludeDesktopElements`, keys `kCGWindowBounds`, `kCGWindowLayer`, `kCGWindowIsOnscreen`, `kCGWindowNumber`
- Accessibility: `kAXMinimizedAttribute`, `kAXWindowMovedNotification`, `kAXWindowResizedNotification`
- Apple forums (fullscreen limitations): <https://developer.apple.com/forums/thread/792917>
- yabai AX event rate note: <https://github.com/koekeishiya/yabai/issues/279>

### Architecture Overview
- New workspace package `@proj-airi/electron-window-dock`
  - `src/index.ts`: Eventa contracts and shared types.
  - `src/main/`: DockController (state machine), platform WindowTracker abstraction, platform-native stubs, IPC handlers.
  - `src/renderer.ts`: IPC client helpers for renderer.
  - `src/vue/`: `useElectronWindowDock()` composable for Vue.
- Integration in `apps/stage-tamagotchi`
  - Main process: initialize dock module in `src/main/index.ts` and attach to main window (overlay).
  - Devtools page: pick target window, start/stop dock, inspect debug state.

### PoC Status (in repo)
- `packages/electron-window-dock`: scaffolding with DockController, IPC wiring, and platform trackers currently using Electron-window fallbacks (no Core Graphics/Win32 probes yet). Configurable click-through/hide behavior to avoid trapping the main window while testing.
- `apps/stage-tamagotchi`: dock init wired in main process; devtools page `/devtools/window-dock` for target selection, interval tuning, and debug snapshots.

### Visibility Contract
1) Target must be frontmost “real” window (no transient/system UI) → overlay visible.
2) Target enters fullscreen Space → overlay hidden; on exit, reattach best-effort.
3) Target not on-screen/minimized/closed → hide and fall back to Companion (non-follow) mode.
4) Overlay input is click-through (`setIgnoreMouseEvents(true, { forward: true })`); optional cursor-enter auto-hide requires cursor hit test.
5) Overlay never steals focus (`showInactive`, `type: 'panel'` on macOS).

### State Machine (DockController)
- `Detached`: no target, overlay idle/hidden.
- `Companion`: fallback fixed position (current AIRI behavior).
- `Docking:AttachedVisible`: target valid, frontmost, not fullscreen → overlay shown and aligned to bounds.
- `Docking:AttachedHidden`: target selected but hidden/fullscreen/not-frontmost → overlay hidden; polling continues with lower frequency.
- Transitions:
  - `selectTarget -> Docking:AttachedHidden` (until visibility passes).
  - `visibility ok -> Docking:AttachedVisible`.
  - `target lost/closed -> Companion`.
  - `explicit stop -> Detached` (clears target).

### Platform Strategy
#### Windows prerequisites
- Visual Studio 2022 Build Tools with Desktop C++ + Windows 10/11 SDK.
- Rust MSVC target: `rustup target add x86_64-pc-windows-msvc` (required for `@proj-airi/win32-window-bindings` during install/prepare).

**macOS (Phase 1)**
- Core Graphics polling: `CGWindowListCopyWindowInfo(optionOnScreenOnly|excludeDesktopElements)` to list; `optionOnScreenAboveWindow` for z-order check. Filter transient/system layers (layer > 0, tiny bounds, alpha ~0).
- Frontmost heuristic: `probeAbove(targetId)` returns zero “real” windows.
- Fullscreen heuristic: target bounds ~= active display bounds; `kCGWindowIsOnscreen` false ⇒ treat hidden/minimized.
- Frontmost app pid: NSWorkspace via `activeSpace` helpers or AX when available.

**macOS (Phase 2)**
- Accessibility (opt-in): subscribe to `kAXWindowMovedNotification`, `kAXWindowResizedNotification`, `kAXMinimizedAttribute`, `AXFullScreen` when present. Use events to temporarily boost poll rate; keep polling as fallback for missed events.

**Windows**
- Win32 APIs (user32): `GetForegroundWindow`, `GetWindowRect`, `IsIconic`, `GetWindowPlacement`, `EnumWindows` + `GetWindow(GW_HWNDPREV)` for z-order probe.
- Fullscreen heuristic: window bounds ~= monitor work area; `SW_SHOWMINIMIZED`/`IsIconic` → hidden.
- Overlay uses layered window flags for click-through.

### Polling and Performance
- Adaptive polling:
  - Active (recent changes or visible): 10–16 Hz.
  - Idle/stable: back off to 2–4 Hz.
  - Hidden/fullscreen: 1–2 Hz.
- Burst acceleration: on detected move/resize/frontmost change, briefly poll at high rate then decay.
- Work is async, no long sync loops in main process.

### IPC and API Surface (Eventa)
- `windowDock.listTargets` → `WindowTargetSummary[]` (onscreen, layer, title, pid, bounds).
- `windowDock.startDock` → { ok, targetId } selects target and begins polling.
- `windowDock.stopDock` → stops and returns to Companion/Detached.
- `windowDock.getDebugState` → snapshot (state, target meta, above-count, poll rate, last transition reason).
- `windowDock.setConfig` → optional tweaks (poll intervals, filters).

### Pseudo Code (DockController)
```ts
function loop() {
  if (!targetId) {
    hideOverlay()
    state = Detached
    return
  }
  const meta = tracker.getWindowMeta(targetId)
  if (!meta || !meta.isOnScreen) {
    state = Companion
    hideOverlay()
    maybeFallback()
    return
  }

  const above = tracker.probeZOrderAbove(targetId, filterRealWindows)
  const isFrontmost = above.length === 0
  const isFullscreen = fullscreenHeuristic(meta, displayBounds)

  if (!isFrontmost || isFullscreen) {
    state = DockingAttachedHidden
    hideOverlay()
    adjustPollInterval(hiddenInterval)
    return
  }

  state = DockingAttachedVisible
  adjustPollInterval(activeInterval)
  overlay.setBounds(pad(meta.bounds, offsets))
  overlay.showInactive()
  overlay.setIgnoreMouseEvents(true, { forward: true })
}
```

### Failure and Degrade Paths
- Missing permissions (macOS AX) → log notice, stay on Core Graphics polling.
- target not found for N cycles → auto-stop dock and switch to Companion; devtools shows “detached”.
- fullscreen detection heuristic false positives → safe side: hide overlay.
- Main-thread safety: all native probes wrapped in try/catch with timeouts; controller can pause polling on repeated failures.

### Debugging and Devtools
- Devtools page lists on-screen windows (filtered) with title/owner/layer.
- Controls: start/stop dock, refresh targets, toggle visibility filters, show debug snapshot (state, poll interval, last meta, above count).
- Metrics exposed via `getDebugState` and tick counters.

### Testing
- DockController unit tests use a mock `WindowTracker` that returns scripted sequences; assert state transitions for frontmost/fullscreen/minimize flows.
- Heuristic helpers (frontmost filter, fullscreen check) are pure functions for direct tests.

### Permissions (macOS)
- Phase 1 works without Accessibility permission (uses CG polling).
- Phase 2: prompt once for Accessibility; cache trust flag; keep working without it but log degraded accuracy.

### Open Items (future)
- Cursor-enter auto-hide implementation (requires global cursor hit test vs overlay bounds).
- Platform-specific filters for transient windows (menus/tooltips) tuned with macOS QA.
- Persist last target per app for quick reattach after fullscreen/Space switches.
