---
name: agent-browser-electron
description: Use when Codex needs to inspect, debug, or automate an Electron app through `agent-browser` and Chrome DevTools Protocol, especially when the app has multiple `BrowserWindow` instances, lazy-created windows, duplicate URLs, or misleading `agent-browser tab list` output. Covers mapping Electron windows to raw CDP targets, identifying routes like `/#/chat`, and attaching `agent-browser` to the correct target by `webSocketDebuggerUrl`.
---

# Agent Browser Electron

## Overview

Inspect Electron renderer windows reliably when `agent-browser` alone is not enough to tell which CDP target maps to which visible app window.

Prefer raw CDP target discovery over guessing from `tab list`, then use `agent-browser --cdp <port> tab` stable tab IDs to interact with the renderer target you want.

## Why Raw CDP Discovery

Use raw CDP target discovery because `agent-browser` is operating as a convenience layer on top of Chrome DevTools Protocol, and that layer can hide or flatten details that matter in Electron.

Raw `/json/list` is the source of truth for CDP target discovery because it exposes Chromium's target inventory without extra interpretation. It is not the same thing as Electron's `BrowserWindow.getAllWindows()`.

In Electron, that distinction matters because:
- multiple `BrowserWindow` instances can share the same URL
- some windows are created lazily and appear only after an app action
- a visible Electron window is inspectable only after its renderer/webContents exists and is exposed as a CDP target
- detached DevTools pages and workers add noise
- `agent-browser tab list` may show only a subset of targets or present them with reduced metadata
- session state inside `agent-browser` can keep you attached to a previous renderer unless you reset and verify

In practice, the higher-level `tab list` view is useful for quick browsing, but not reliable enough for window-to-target mapping when:
- two Electron windows both look like `http://localhost:5173/#/`
- the title is empty or collapsed
- a chat or settings window exists in CDP but is not obvious in the simplified tab output

Use `curl http://127.0.0.1:<port>/json/list` first whenever correct target selection matters. Treat `agent-browser` as the interaction client after target discovery, not as the only discovery source.

If `/json/list` does not contain a window that the user says exists, do not assume `agent-browser` hid it. First consider that the window may not have been created yet, may not have loaded a renderer route yet, or may not currently be exposed as a CDP target. Trigger the window from the app UI or Electron main-process action, then enumerate `/json/list` again.

## Workflow

1. Confirm the app exposes a CDP port.

The CDP port is project- and run-command-specific. Do not assume `9222`, `9250`, or any other value is universal. If an Electron process is running but no CDP port responds, tell the user to relaunch the app with the project's remote-debug environment variables or launch flags.

For AIRI stage-tamagotchi on POSIX shells:

```bash
APP_REMOTE_DEBUG=true APP_REMOTE_DEBUG_PORT=9250 pnpm dev:tamagotchi
```

For Windows PowerShell:

```powershell
$env:APP_REMOTE_DEBUG = "true"
$env:APP_REMOTE_DEBUG_PORT = "9250"
pnpm dev:tamagotchi
```

For Windows Git Bash:

```bash
APP_REMOTE_DEBUG=true APP_REMOTE_DEBUG_PORT=9250 pnpm dev:tamagotchi
```

Adjust the port to match what the user actually started. If the project uses a different mechanism, inspect its Electron launch code before giving command advice.

2. Ensure the Electron window exists.

If the app uses lazy window creation, `agent-browser` cannot inspect a window that has not been created yet. Open it from the app UI or trigger its Electron-side open handler first.

3. Inspect raw CDP targets instead of trusting `agent-browser --cdp <port> tab`.

```bash
curl -sS http://127.0.0.1:<port>/json/list
```

Read these fields:
- `title`
- `url`
- `type`
- `webSocketDebuggerUrl`

Use `/json/version` if you need to confirm the port is a Chromium/Electron CDP endpoint or need the browser-level debugger URL:

```bash
curl -sS http://127.0.0.1:<port>/json/version
```

4. Match the target to the Electron window.

Common patterns:
- Distinct route: chat may be `http://localhost:5173/#/chat` while the main window is `http://localhost:5173/#/`.
- Distinct title: Electron window titles may surface in the target list.
- Duplicate URLs: two windows may both report `http://localhost:5173/#/`; in that case use screenshots, snapshots, and Electron app knowledge to disambiguate.
- Hidden noise: worker targets and detached DevTools targets are not your app window.

5. List the targets through `agent-browser` and switch with stable tab IDs.

```bash
agent-browser --cdp <port> tab
agent-browser --cdp <port> tab t2
```

Do not use positional integers. If `agent-browser tab` prints `[t2]`, switch with `tab t2`.

6. Verify the target immediately.

```bash
agent-browser --cdp <port> get url
agent-browser --cdp <port> get title
agent-browser --cdp <port> snapshot -i
```

7. If stable tab switching is not enough, reset session state and reconnect.

```bash
agent-browser close --all
agent-browser connect <webSocketDebuggerUrl>
agent-browser get url
```

If needed:

```bash
agent-browser --cdp <port> screenshot /tmp/electron-target.png --annotate
agent-browser --cdp <port> console
agent-browser --cdp <port> errors
```

## Fast Triage

Use this order when the Electron app has multiple windows:

1. `curl /json/list`
2. Find the renderer page target with the route or title you expect
3. Ignore `worker` targets unless the task is specifically about workers
4. Ignore `DevTools` page targets unless debugging DevTools itself
5. `agent-browser --cdp <port> tab`
6. Switch with the stable tab ID, for example `agent-browser --cdp <port> tab t3`
7. `agent-browser --cdp <port> get url`
8. `agent-browser --cdp <port> snapshot -i`
9. If the expected route is missing, trigger the lazy window from the UI and repeat from step 1

## AIRI Example

In `apps/stage-tamagotchi`, some windows are lazy-created. The main window loads `/#/`; settings loads `/#/settings`; chat loads `/#/chat`; BeatSync loads `/beat-sync.html`.

The `9250` examples below assume the app was started by the person running it with:

```bash
APP_REMOTE_DEBUG=true APP_REMOTE_DEBUG_PORT=9250 pnpm dev:tamagotchi
```

That port is not intrinsic to AIRI or Electron. It depends on the current command and environment. Most stage-tamagotchi code lives under `apps/stage-tamagotchi`; inspect that app's Electron startup and window code when the port, routes, or remote-debug behavior differ.

Relevant files:
- `apps/stage-tamagotchi/src/main/windows/chat/index.ts`
- `apps/stage-tamagotchi/src/main/windows/main/index.ts`
- `apps/stage-tamagotchi/src/main/libs/electron/window-manager/reusable.ts`
- `apps/stage-tamagotchi/src/renderer/components/stage-islands/controls-island/index.vue`

That means:
- chat does not exist in CDP until something calls `chatWindow()`
- settings and chat can be opened from the main window controls
- once created, raw CDP target discovery will show page targets such as `http://localhost:5173/#/settings` and `http://localhost:5173/#/chat`
- the stable way to inspect a window is to enumerate raw CDP targets, map them to `agent-browser` stable tab IDs, switch, and verify with `get url`

Example:

```bash
curl -sS http://127.0.0.1:9250/json/list
agent-browser --cdp 9250 tab
agent-browser --cdp 9250 tab t4
agent-browser --cdp 9250 get url
agent-browser --cdp 9250 snapshot -i
```

If settings or chat is missing, start from the main window:

```bash
agent-browser --cdp 9250 tab t2
agent-browser --cdp 9250 snapshot -i
# Click the main window control that opens the panel or launcher.
# In AIRI this is the arrow-up control in the bottom-right controls island.
# Re-snapshot after every click because refs are stale after UI changes.
agent-browser --cdp 9250 click '[i-solar\:alt-arrow-up-line-duotone]'
agent-browser --cdp 9250 snapshot -i
```

Then open the desired entry from the expanded controls and enumerate again:

```bash
agent-browser --cdp 9250 click '[i-solar\:settings-minimalistic-outline]'
agent-browser --cdp 9250 click '[i-solar\:chat-line-line-duotone]'
curl -sS http://127.0.0.1:9250/json/list
agent-browser --cdp 9250 tab
```

If the controls island is visible but the accessibility refs or CSS icon click do not expand it, inspect the Vue component as a diagnostic fallback. AIRI currently nests tooltip trigger buttons around icon buttons, so a CDP click can report success while landing on the wrapper instead of the Vue `ControlButton` listener. This fallback is for automation/debugging only; do not use it as evidence that end-user clicking works.

```bash
agent-browser --cdp 9250 eval '(() => {
  const icon = document.querySelector("[i-solar\\:alt-arrow-up-line-duotone]")
  let controls = icon.__vueParentComponent
  for (let i = 0; i < 10; i++) controls = controls.parent
  controls.devtoolsRawSetupState.expanded.value = true
  controls.proxy.$nextTick()
  return controls.devtoolsRawSetupState.expanded.value
})()'
```

Expected verification for chat:
- `agent-browser --cdp 9250 get url` returns `http://localhost:5173/#/chat`
- the snapshot exposes chat UI controls such as the message textbox or send button

Expected verification for settings:
- `agent-browser --cdp 9250 get url` returns `http://localhost:5173/#/settings`
- the snapshot exposes settings navigation or configuration controls

## Failure Modes

- `agent-browser tab` omits or flattens the target you need: use raw `/json/list`.
- `/json/list` and browser-level target discovery both omit the window: the renderer target is not currently exposed. Trigger the window creation/loading path, then enumerate again.
- `connect <webSocketDebuggerUrl>` appears to succeed but later commands still point at another renderer: switch with `agent-browser --cdp <port> tab tN`, or run `agent-browser close --all`, reconnect, and verify with `get url`.
- multiple windows share the same URL: use the target title, annotated screenshots, and app code to correlate them.
- `eval` returns `{}` for object values: prefer `get url`, `get title`, `snapshot -i`, or primitive-only eval return values.
- no chat or settings target appears: the window may not have been created yet, or may exist as an Electron object without an inspectable renderer target.
