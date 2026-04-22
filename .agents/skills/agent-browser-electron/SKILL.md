---
name: agent-browser-electron
description: Use when Codex needs to inspect, debug, or automate an Electron app through `agent-browser` and Chrome DevTools Protocol, especially when the app has multiple `BrowserWindow` instances, lazy-created windows, duplicate URLs, or misleading `agent-browser tab list` output. Covers mapping Electron windows to raw CDP targets, identifying routes like `/#/chat`, and attaching `agent-browser` to the correct target by `webSocketDebuggerUrl`.
---

# Agent Browser Electron

## Overview

Inspect Electron renderer windows reliably when `agent-browser` alone is not enough to tell which CDP target maps to which `BrowserWindow`.

Prefer raw CDP target discovery over guessing from `tab list`, then connect `agent-browser` directly to the exact renderer target you want.

## Why Raw CDP Discovery

Use raw CDP target discovery because `agent-browser` is operating as a convenience layer on top of Chrome DevTools Protocol, and that layer can hide or flatten details that matter in Electron.

Raw `/json/list` is the source of truth for target discovery because it exposes the browser's own target inventory without extra interpretation. In Electron, that matters because:
- multiple `BrowserWindow` instances can share the same URL
- some windows are created lazily and appear only after an app action
- detached DevTools pages and workers add noise
- `agent-browser tab list` may show only a subset of targets or present them with reduced metadata
- session state inside `agent-browser` can keep you attached to a previous renderer unless you reset and verify

In practice, the higher-level `tab list` view is useful for quick browsing, but not reliable enough for window-to-target mapping when:
- two Electron windows both look like `http://localhost:5173/#/`
- the title is empty or collapsed
- a chat or settings window exists in CDP but is not obvious in the simplified tab output

Use `curl http://127.0.0.1:<port>/json/list` first whenever correct target selection matters. Treat `agent-browser` as the interaction client after target discovery, not as the discovery source.

## Workflow

1. Ensure the Electron window exists.

If the app uses lazy window creation, `agent-browser` cannot inspect a window that has not been created yet. Open it from the app UI or trigger its Electron-side open handler first.

2. Inspect raw CDP targets instead of trusting `agent-browser --cdp <port> tab list`.

```bash
curl -sS http://127.0.0.1:<port>/json/list
```

Read these fields:
- `title`
- `url`
- `type`
- `webSocketDebuggerUrl`

Use `/json/version` if you need the browser-level debugger URL:

```bash
curl -sS http://127.0.0.1:<port>/json/version
```

3. Match the target to the Electron window.

Common patterns:
- Distinct route: chat may be `http://localhost:5173/#/chat` while the main window is `http://localhost:5173/#/`.
- Distinct title: Electron window titles may surface in the target list.
- Duplicate URLs: two windows may both report `http://localhost:5173/#/`; in that case use screenshots, snapshots, and Electron app knowledge to disambiguate.
- Hidden noise: worker targets and detached DevTools targets are not your app window.

4. Reset `agent-browser` session state before switching targets.

```bash
agent-browser close --all
```

5. Connect directly to the target you want.

```bash
agent-browser connect <webSocketDebuggerUrl>
```

6. Verify the target immediately.

```bash
agent-browser get url
agent-browser get title
agent-browser snapshot -i
```

If needed:

```bash
agent-browser screenshot /tmp/electron-target.png --annotate
agent-browser console
agent-browser errors
```

## Fast Triage

Use this order when the Electron app has multiple windows:

1. `curl /json/list`
2. Find the renderer page target with the route or title you expect
3. Ignore `worker` targets unless the task is specifically about workers
4. Ignore `DevTools` page targets unless debugging DevTools itself
5. `agent-browser close --all`
6. `agent-browser connect <webSocketDebuggerUrl>`
7. `agent-browser get url`
8. `agent-browser snapshot -i`

## AIRI Example

In `apps/stage-tamagotchi`, the chat window is lazy-created and loaded with `/#/chat`. The main window loads `/#/`.

Relevant files:
- `apps/stage-tamagotchi/src/main/windows/chat/index.ts`
- `apps/stage-tamagotchi/src/main/windows/main/index.ts`
- `apps/stage-tamagotchi/src/main/libs/electron/window-manager/reusable.ts`
- `apps/stage-tamagotchi/src/renderer/components/stage-islands/controls-island/index.vue`

That means:
- chat does not exist in CDP until something calls `chatWindow()`
- once created, raw CDP target discovery will show a page target whose URL is `http://localhost:5173/#/chat`
- the stable way to inspect chat is to connect `agent-browser` to that target's `webSocketDebuggerUrl`

Example:

```bash
curl -sS http://127.0.0.1:9250/json/list
agent-browser close --all
agent-browser connect ws://127.0.0.1:9250/devtools/page/<chat-target-id>
agent-browser get url
agent-browser snapshot -i
```

Expected verification for chat:
- `agent-browser get url` returns `http://localhost:5173/#/chat`
- the snapshot exposes chat UI controls such as the message textbox or send button

## Failure Modes

- `tab list` omits or flattens the target you need: use raw `/json/list`.
- `connect` appears to succeed but later commands still point at the old renderer: run `agent-browser close --all`, then reconnect and verify with `get url`.
- multiple windows share the same URL: use the target title, annotated screenshots, and app code to correlate them.
- `eval` returns `{}` for object values: prefer `get url`, `get title`, `snapshot -i`, or primitive-only eval return values.
- no chat target appears: the window may not have been created yet.
