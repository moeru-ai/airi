## AIRI Dock Mode

Dock Mode keeps an AIRI overlay window on a target window that the user selects. The overlay is a transparent, click-through window that AIRI owns. Dock Mode does not reparent the windows of other apps, and it uses no private APIs.

The API reference is in [`packages/electron-window-dock/README.md`](../packages/electron-window-dock/README.md).

### Status

- Package: `packages/electron-window-dock`.
- App integration: `apps/stage-tamagotchi/src/main/windows/dock-overlay/`.
- UI: the devtools page `/devtools/window-dock`, in Settings > System > Developer. There is no user setting yet.
- Windows: a native window tracker. This version is not verified on Windows.
- macOS: the Electron-only tracker. It sees only the windows of AIRI, so Dock Mode can dock only to an AIRI window.
- Linux: no tracker. The target list is empty.

### Architecture

- `src/index.ts`: the Eventa contracts (`windowDock`), the shared types, and `defaultDockConfig`.
- `src/main/controller.ts`: `DockController`. It owns the session, the overlay window, the poll loop, and the config.
- `src/main/native/`: one window tracker for each platform. `native/index.ts` selects the tracker.
- `src/main/index.ts`: `setupWindowDock`. It creates the controller and registers the invoke handlers.

The app gives `createOverlayWindow` to `setupWindowDock`. This function does these steps:

1. It creates a hidden, transparent, not focusable window. The window has `skipTaskbar` and shows on all workspaces. On macOS, its type is `panel`, the same as the main window. It also sets `excludedFromShownWindowsMenu`, so that the Window menu of AIRI does not list the overlay.
2. It creates an Eventa context with `onlySameWindow: true`, so the base handlers of the overlay hear only the overlay.
3. It registers the base window handlers. Then it loads `dock-overlay.html#/dock-overlay` with `synced-leader=false`.

If a step fails, or Dock Mode aborts the `signal` argument, the function destroys the window.

### Overlay lifecycle

- At app start, Dock Mode registers only the invoke handlers. No overlay window exists, and the Win32 tracker has not loaded its binding.
- The first `start` of a session creates and loads the overlay window. The window stays hidden until a tick shows it.
- `stop`, a lost target, and the app quit end the session. Each one stops the poll loop and destroys the overlay window.
- If the overlay creation fails, `start` rejects with its error. The session ends in `detached` with the reason `overlay-failed`.
- If the overlay creation takes longer than 30 s, Dock Mode aborts the signal of `createOverlayWindow`. Then `start` fails in the same way. Dock Mode destroys a window that arrives after the abort.
- If code outside Dock Mode closes or destroys the overlay window, the next tick ends the session in `detached` with the reason `overlay-destroyed`.
- A `stop` and a new `start` during the overlay creation share that creation. The new session uses the window.
- A normal close of the main window only hides that window. Dock Mode does not depend on the main window, so the session continues.
- The overlay renderer is a follower of the synchronized stores. It reads the stage model from `useSettingsStageModel`.
- It reads the theme from `useSettingsTheme`. This store reads localStorage and follows its changes from other windows.

### Visibility contract

Each tick reads the target. Then it applies the first rule that matches:

1. If the overlay window is destroyed, the session ends in `detached`.
2. If the tracker does not find the target, the session ends in `companion`.
3. If the target is hidden or minimized, the overlay hides. The state is `companion`, and polling continues.
4. If the target is fullscreen, the overlay hides. The state is `docking-attached-hidden`.
5. If a real window is above the target, the overlay hides. The state is `docking-attached-hidden`.
6. In all other cases, the overlay moves to the viewport rect of the target. It goes always on top and shows without focus.

Rule 5 applies only when `hideWhenNotFrontmost` is `true`, the default. Rules 3 and 4 apply with either value.

A real window above the target is not the overlay, not minimized, and on screen. It is at least 60 by 60 DIP, and its layer is 0 or not set.

A tracker can give a fullscreen flag. The Electron-only tracker gives it. The Win32 tracker gives no flag, so the controller compares the target bounds with the display bounds. A difference of up to 6 DIP on each value counts as a match.

When `clickThrough` is `true`, the overlay calls `setIgnoreMouseEvents(true, { forward: true })`. Mouse events go through the overlay to the windows below it.

These rules show or hide the overlay window. The overlay renderer can also hide the character in a visible window. See [Auto-hide near the cursor](#auto-hide-near-the-cursor).

### Auto-hide near the cursor

The option `hideOnHover` (default `true`) hides the character while the cursor is on it or near it. The character shows again when the cursor moves away. Click-through alone lets clicks reach the target, but the character still covers its content.

Auto-hide reuses the Fade on Hover option of the main stage window (`pages/index.vue` and `utils/fade-on-hover.ts`):

- Cursor position: the main process polls `screen.getCursorScreenPoint()` and sends it to the overlay renderer through `useElectronRelativeMouse`. The overlay is click-through, so it gets no DOM mouse events. The gaze of the character uses the same position.
- Hit area: the cursor is near the character when a painted pixel of the model is within 25 px of it (`FADE_ON_HOVER_REGION_RADIUS`). Live2D reads its canvas. VRM reads an offscreen render target. A cursor outside the overlay window never counts.
- Hide: the character goes to opacity 0 with a 250 ms transition. Thus it hides fully, the same as Fade on Hover.
- Restore: when no painted pixel is within 25 px of the cursor, the character goes back to opacity 1 with the same transition. There is no extra delay. The render loop continues at opacity 0, so the hit test still sees the hidden model.

Differences from Fade on Hover:

- Auto-hide sets no click-through. The dock controller owns the click-through of the overlay (`clickThrough`). With `clickThrough: false`, the hidden character still takes the mouse events.
- The overlay has no controls, so there are no exceptions for the controls island or the window border.
- Fade on Hover is off by default and stored in the renderer. `hideOnHover` is on by default and is part of the dock config.

The overlay renderer gets the option from the main process. It reads it with `windowDock.getConfig` when it mounts. The main process also sends `windowDock.configChanged` to the overlay window when it creates the window and after each accepted config update.

### States

| State | Meaning |
| --- | --- |
| `detached` | No session. Dock Mode never started, a caller stopped it, or the overlay window failed or was destroyed. |
| `companion` | The target is hidden or minimized, and the session continues. A lost target also ends the session in this state. |
| `docking-attached-visible` | The overlay is on the target. |
| `docking-attached-hidden` | The target is fullscreen or not frontmost. The overlay is hidden. |

### Polling

- The poll loop runs only during a session. Without a target, nothing polls.
- While the overlay is visible, the interval is `activeIntervalMs` (80 ms).
- After the overlay shows or the target moves, `burstTicks` (3) ticks use `burstIntervalMs` (40 ms).
- While the target is hidden, fullscreen, or not frontmost, the interval is `hiddenIntervalMs` (1000 ms).
- A generation number increases on each `start` and at the end of each session. A tick that waited for the tracker stops if the number changed.
- The main process validates each config update with Valibot. It rejects values outside the limits in the package README.

### Platform trackers

#### Windows

- The tracker uses `listWindows`, `getWindow`, `getWindowsAbove`, and `getForegroundWindow` of `@proj-airi/native-window-win32`.
- It converts each rect from physical pixels to DIP with `screen.screenToDipRect`.
- The z-order walk drops each window of this process. Thus with the binding, AIRI windows, for example the always-on-top main window, do not count as windows above the target. This is not verified on Windows.
- If the target is the foreground window, the tracker reports no windows above it. Then the target counts as frontmost, even when the walk reports other windows above it.
- At debug level, the tracker logs the owner PID, the title, and the extended style of each window of another process that the walk reports above the target. It logs again only when the list changes. The app sets the global log level to `Log`, so these logs do not show by default.
- The first tracker call loads the binding. If the load fails, the tracker logs one warning and uses the Electron-only fallback until the app quits.
- If a call to the binding fails, the tracker logs a warning and uses the fallback for that call.
- The fallback does not drop AIRI windows. It uses the rules in [macOS](#macos), so an AIRI window that intersects the target can hide the overlay.

The binding is a native build. The `build` script of the binding skips the native build when `cargo --version` fails. Then the app has no binding, and Dock Mode uses the Electron-only fallback. For the build steps, the CI variable `AIRI_REQUIRE_NATIVE_WINDOW_WIN32`, and the packaging rules, see [`packages/native-window-win32/README.md`](../packages/native-window-win32/README.md).

#### macOS

- The tracker uses the Electron-only fallback. It lists `BrowserWindow.getAllWindows()`, that is, only the windows of AIRI.
- Electron gives no z-order. The fallback finds the windows above the target from the focus and the always-on-top state of the AIRI windows. It applies the first rule that matches:
  1. If no AIRI window has focus, the fallback reports one window of display size, `external:frontmost`, above the target. Thus the overlay hides when another app has focus. This is the only signal of other apps that the fallback has.
  2. If the target has focus, the target is frontmost. No window is above it.
  3. Another AIRI window has focus. Each other AIRI window that intersects the target counts when it has focus, or when it is visible and always on top. If the target is always on top, only the focused window counts.
- In rule 3, the windows of other apps do not count, because the fallback cannot see them.

A native macOS tracker is not implemented. The plan is Core Graphics polling (`CGWindowListCopyWindowInfo`) and optional Accessibility events for move and resize.

#### Linux

There is no tracker. The target list is empty, and Dock Mode cannot start a useful session.

### IPC API (Eventa)

| Contract | Request | Response |
| --- | --- | --- |
| `windowDock.listTargets` | None | `WindowTargetSummary[]` without the overlay window |
| `windowDock.start` | `{ targetId }` | `DockDebugState` |
| `windowDock.stop` | None | `DockDebugState` |
| `windowDock.getDebugState` | None | `DockDebugState` |
| `windowDock.getConfig` | None | `Required<DockConfig>`, a copy of the running config |
| `windowDock.setConfig` | `DockConfig`, any subset | `DockDebugState`, or an error that names each invalid field |
| `windowDock.configChanged` (event) | `Required<DockConfig>` | None. The main process sends it only to the overlay window. |

The handlers use an Eventa context without a window. Any renderer can call them, and the reply goes to the caller.

Such a context cannot send an event that is not a reply. Thus the main process sends `windowDock.configChanged` through a second context, bound to the overlay window with `onlySameWindow`. This context disposes itself when the overlay window closes.

### Devtools page

- Lists the targets, with an on-screen filter and an automatic refresh.
- Starts and stops Dock Mode, and shows the debug state: state, poll interval, reason, windows above, target, and last update.
- Sets the poll intervals, the padding, click-through, the viewport, `hideWhenNotFrontmost`, and `hideOnHover`.
- Reads the running config with `windowDock.getConfig` when it opens, so the fields show the running values.
- Applies an option edit through `windowDock.setConfig` 300 ms after the last change. There is no Apply button.
- Shows a toast for each result. If the main process rejects the update, the running config does not change, and the toast shows the validation error.
- Uses the shared renderer Eventa context of `@proj-airi/electron-vueuse`.

### Testing

- `pnpm -F @proj-airi/electron-window-dock exec vitest run` runs the package tests.
- The controller tests use a fake tracker, a fake overlay window, a mocked `electron.screen`, and fake timers.
- `native/electron-fallback.test.ts` tests the rules of the Electron-only fallback with a mocked `BrowserWindow`.
- `index.test.ts` connects fake renderers to a fake `ipcMain` through the real Eventa adapters. It tests that only the overlay renderer gets `windowDock.configChanged`. It also tests that the overlay context removes its IPC listeners when the overlay window closes.
- No automated test covers the auto-hide of the overlay renderer. It needs a WebGL canvas with a model.
- No automated test runs a real tracker or a real overlay window.
- No automated test covers the Win32 tracker, for example its foreground check. The tracker loads the binding only when `process.platform` is `win32`.
- No automated test covers the overlay window factory in `apps/stage-tamagotchi/src/main/windows/dock-overlay/`.

### Known limits

- Many AIRI windows create their Eventa contexts without `onlySameWindow`. Thus their base window handlers also run for invokes from other windows, for example the overlay.
- Examples in `apps/stage-tamagotchi/src/main` are the main window (`windows/main/rpc/index.electron.ts`), the settings window (`windows/settings/rpc/index.electron.ts`), and the onboarding window (`windows/onboarding/index.ts`). The caption, spotlight, and dashboard windows also do this.
- These contexts are in upstream code. Dock Mode does not change them.
- A macOS test run of this branch before its last fixes measured three handler runs for one invoke from the devtools page, and four for one invoke from the overlay. Each count had the handlers of the main window, the settings window, and a closed onboarding window. The overlay count also had the handler of the overlay. Each invoke returned the correct result.

### Verified by hand on macOS

A manual test of the packaged app on macOS confirmed these changes:

- A focused Settings target counts as frontmost, and the overlay shows. An earlier test found `not-frontmost` in this case.
- Auto-hide near the cursor hides the character, and the character comes back when the cursor leaves.
- Option edits apply without a button, and toasts show the result.

### Not verified on macOS

No test ran these changes in the app yet:

- The Window menu of AIRI does not list the overlay. An earlier test found "AIRI Dock Overlay" in this menu. The menu of the Dock icon was not tested.
- The other frontmost rules of the Electron-only fallback, for example a focused AIRI window over the target. Unit tests cover them.
- Auto-hide with a VRM model.
- The overlay stays on a covered target when `hideWhenNotFrontmost` is off.
- The fields show the running values when the page opens again.

### Not verified on Windows

Nobody ran this version on Windows. These parts are not verified on Windows:

- The z-order walk filters the windows of this process. An older version subtracted one window above the target. The cause of that window is not verified on Windows.
- A foreground target counts as frontmost. This check replaces the subtraction. Its effect on the extra window is not verified on Windows.
- The target list drops windows of this process that have the overlay title.
- The fullscreen check accepts a difference of 6 DIP.
- `screen.screenToDipRect` converts the rects of the binding to DIP.
- Click-through on the overlay window.
- Auto-hide near the cursor.

### Open items

- A native macOS tracker with Core Graphics, and optional Accessibility events.
- A user setting for Dock Mode outside the devtools page.
- Automatic reattach after a lost target, and a saved last target.
- A shared composable for the cursor hit test of Fade on Hover and of auto-hide. Now each page builds the samplers itself.
- `onlySameWindow` for the Eventa contexts of the other AIRI windows. See [Known limits](#known-limits).

### References

- electron-overlay-window: <https://github.com/SnosMe/electron-overlay-window>
- electron-overlay-window macOS support PR: <https://github.com/SnosMe/electron-overlay-window/pull/17>
- electron-overlay-window macOS fullscreen issue: <https://github.com/SnosMe/electron-overlay-window/issues/37>
- awakened-poe-trade macOS overlay PR: <https://github.com/SnosMe/awakened-poe-trade/pull/403>
- Electron alwaysOnTop and macOS fullscreen (wontfix): <https://github.com/electron/electron/issues/10078>
- Core Graphics window APIs: `CGWindowListCopyWindowInfo`, `optionOnScreenAboveWindow`, `optionOnScreenOnly`, `excludeDesktopElements`, and the keys `kCGWindowBounds`, `kCGWindowLayer`, `kCGWindowIsOnscreen`, `kCGWindowNumber`
- Accessibility: `kAXMinimizedAttribute`, `kAXWindowMovedNotification`, `kAXWindowResizedNotification`
- Apple forums, fullscreen limits: <https://developer.apple.com/forums/thread/792917>
- yabai, AX event rate: <https://github.com/koekeishiya/yabai/issues/279>
