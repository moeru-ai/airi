# @proj-airi/electron-window-dock

Dock Mode for the AIRI Electron app. It keeps an AIRI overlay window on a target window that the user selects.

## What it does

- Polls the bounds and the z-order of the target window in the Electron main process.
- Moves a transparent overlay window onto the target, or onto a rect inside the target.
- Hides the overlay when the target is hidden, minimized, fullscreen, or not frontmost.
- Creates the overlay window on the first start of a session, and destroys it when the session ends.
- Sends the config to the overlay renderer. With `hideOnHover`, the renderer hides the character while the cursor is near it.
- Gives Eventa contracts (`windowDock`) to list the targets, start, stop, read the debug state, and read and set the config.

It moves only the AIRI overlay. It does not move or reparent the windows of other apps.

### Platforms

| Platform | Tracker | Windows that the tracker sees |
| --- | --- | --- |
| Windows | `@proj-airi/native-window-win32` | All top-level windows, with z-order and owner PID. If the binding does not load, the tracker uses the Electron-only fallback. |
| macOS | Electron-only fallback | Only the windows of AIRI. On macOS, Dock Mode can dock only to an AIRI window. |
| Linux | None | No windows. The target list is empty. |

See [`docs/dock-mode.md`](../../docs/dock-mode.md) for the visibility rules of each tracker.

## How to use

In the main process, call `setupWindowDock` one time. Give it a function that creates the overlay window.

```ts
import { setupWindowDock } from '@proj-airi/electron-window-dock/main'

const windowDock = setupWindowDock({
  // Return a hidden, transparent, not focusable window. Load its page before you return it.
  // When `signal` aborts, destroy the window.
  createOverlayWindow: async signal => createOverlayWindow(signal),
})

// On app quit, end the session and remove the IPC handlers.
app.on('before-quit', () => windowDock.dispose())
```

In a renderer, call the `windowDock` contracts through the shared Eventa context.

```ts
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { windowDock } from '@proj-airi/electron-window-dock'

const listTargets = useElectronEventaInvoke(windowDock.listTargets)
const startDock = useElectronEventaInvoke(windowDock.start)
const stopDock = useElectronEventaInvoke(windowDock.stop)

const [target] = await listTargets()
await startDock({ targetId: target.id })
await stopDock()
```

In AIRI, `apps/stage-tamagotchi/src/main/windows/dock-overlay/` gives the overlay window. The devtools page `/devtools/window-dock` is the UI.

## API

### `@proj-airi/electron-window-dock/main`

| Export | Description |
| --- | --- |
| `setupWindowDock(options)` | Creates the dock controller and registers the `windowDock` invoke handlers. Returns a `WindowDock`. |
| `WindowDockOptions.createOverlayWindow` | `(signal: AbortSignal) => Promise<BrowserWindow>`. Dock Mode calls it on the first start of a session. After 30 s, Dock Mode aborts `signal`. |
| `WindowDock.dispose()` | Removes the handlers, ends the session, and destroys the overlay window. |

The handlers use an Eventa context without a window. Any renderer can call them, and the reply goes to the caller.

### `@proj-airi/electron-window-dock`

| Contract | Request | Response |
| --- | --- | --- |
| `windowDock.listTargets` | None | `WindowTargetSummary[]`. The overlay window is not in the list. |
| `windowDock.start` | `{ targetId }` | `DockDebugState`. Starts a session, or changes the target of the current session. |
| `windowDock.stop` | None | `DockDebugState`. Ends the session and destroys the overlay window. |
| `windowDock.getDebugState` | None | `DockDebugState` |
| `windowDock.getConfig` | None | `Required<DockConfig>`, a copy of the running config. |
| `windowDock.setConfig` | `DockConfig`, any subset of the fields | `DockDebugState`. Rejects an update with a value outside the limits. |
| `windowDock.configChanged` (event) | `Required<DockConfig>` | None. The main process sends it to the overlay window when it creates the window and after each accepted update. |

The entry also exports `defaultDockConfig` and the types `DockConfig`, `DockViewport`, `DockDebugState`, `DockModeState`, and `WindowTargetSummary`.

### Config

The main process validates each update with Valibot. An invalid update throws, and the current config stays. The error message names each invalid field, for example `activeIntervalMs: Invalid value: Expected >=16 but received 5`.

| Field | Default | Limits | Effect |
| --- | --- | --- | --- |
| `activeIntervalMs` | `80` | 16 to 60000 | The poll interval while the overlay is visible. |
| `hiddenIntervalMs` | `1000` | 100 to 60000 | The poll interval while the target is hidden, fullscreen, or not frontmost. |
| `burstIntervalMs` | `40` | 16 to 60000 | The poll interval after the overlay shows or the target moves. |
| `burstTicks` | `3` | Integer, 0 to 100 | The number of ticks at `burstIntervalMs`. |
| `clickThrough` | `true` | | If `true`, mouse events go through the overlay. |
| `padding` | `0` | 0 to 500 DIP | The space added on each side of the viewport rect. |
| `hideWhenNotFrontmost` | `true` | | If `true`, the overlay hides while a window is above the target. A hidden, minimized, or fullscreen target hides the overlay with either value. |
| `hideOnHover` | `true` | | If `true`, the character hides while the cursor is on it or near it. The overlay renderer applies it, not the controller. |
| `viewport` | `{ left: 0, right: 1, top: 0, bottom: 1 }` | Each edge 0 to 1, `left < right`, `top < bottom` | A rect inside the target, as fractions of the target size. |

### Sessions and states

| Event | Result |
| --- | --- |
| `start` without a session | Creates the overlay window, sets the target, and runs the first tick at once. |
| `start` during a session | Changes the target. The overlay window stays. |
| `start` during the overlay creation | Uses the same creation. The last `start` sets the target. |
| The overlay creation fails | `start` rejects with the error. The session ends in `detached` with the reason `overlay-failed`. |
| The overlay creation takes longer than 30 s | Aborts `signal`, and `start` rejects. The session ends in `detached` with the reason `overlay-failed`. A window that arrives later is destroyed. |
| `stop` | Ends the session in `detached`. Polling stops, and the overlay window is destroyed. A window that arrives later is destroyed, unless a new `start` uses it. |
| The tracker does not find the target | Ends the session in `companion` with the reason `target-missing`. |
| Code outside Dock Mode destroys the overlay window | The next tick ends the session in `detached` with the reason `overlay-destroyed`. |
| `dispose` | Ends the session. After this, `start` does nothing. |

| State | Meaning |
| --- | --- |
| `detached` | No session. Dock Mode never started, a caller stopped it, or the overlay window failed or was destroyed. |
| `companion` | The target is hidden or minimized, and the session continues. A lost target also ends the session in this state. |
| `docking-attached-visible` | The overlay is on the target. |
| `docking-attached-hidden` | The target is fullscreen or not frontmost. The overlay is hidden. |

## When to use

- On Windows, use it in the AIRI Electron app to show AIRI on top of one window of another app. This is the intended use. It is not verified on Windows.
- Use it on macOS to show AIRI on top of another AIRI window.

## When not to use

- Do not use it on macOS to follow the windows of other apps. The macOS tracker sees only the windows of AIRI.
- Do not use it on Linux. The tracker finds no windows there.
- Do not import `./main` in a renderer. Renderers use only the contracts of the root entry.
- Do not use it to move, resize, or reparent the windows of other apps.

## Not verified on Windows

The tests use a fake tracker. Nobody ran this version on Windows. These parts are not verified on Windows:

- The Win32 tracker filters the windows of this process from the windows above the target.
- The Win32 tracker reports no windows above a foreground target, so that target counts as frontmost.
- The target list drops windows of this process that have the overlay title.
- The fullscreen check accepts a difference of 6 DIP between the target bounds and the display bounds.
- `screen.screenToDipRect` converts the rects of the binding to DIP.
- Click-through with `setIgnoreMouseEvents(true, { forward: true })` on the overlay window.
