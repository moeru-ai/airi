# Validation Contract: AIRI Tauri Port

Behavioral assertions organized by area. Each assertion has a stable ID, tool, and evidence requirements.

---

## Area: Core System (SYS)

Command: agent-browser + cargo test + pnpm typecheck

### VAL-TAURI-SYS-001: Tauri app scaffold builds
`cd apps/stage-tauri && cargo build` compiles without errors. Required for any Tauri feature to run.
Tool: cargo build
Evidence: terminal output with `Finished` line

### VAL-TAURI-SYS-002: Tauri app starts on Linux
`cargo tauri dev` launches the Rust process, the vite dev server on port 1420, and the main window appears on screen within 30 seconds.
Tool: cargo tauri dev + agent-browser screenshot
Evidence: terminal output showing `[INFO] Dev server running`, screenshot of AIRI main window

### VAL-TAURI-SYS-003: Main window loads Vue app
The main window's web content renders the Vue 3 app (`#app` exists, not a blank page). Default page is the character rendering view.
Tool: agent-browser screenshot
Evidence: screenshot, console-errors

### VAL-TAURI-SYS-004: Rust commands are callable
A Tauri command `window_get_bounds` can be invoked from the renderer and returns `{ x, y, width, height }` matching the actual window position.
Tool: agent-browser
Evidence: screenshot of page showing bounds values, console-errors

### VAL-TAURI-SYS-005: Window lifecycle events fire
When the main window is minimized and restored, the Rust backend emits `electron:window:lifecycle-changed` events with correct `isMinimized` / `isVisible` / `isFocused` states.
Tool: agent-browser
Evidence: console logs showing events, terminal output

---

## Area: IPC Adapter (IPC)

### VAL-TAURI-IPC-001: eventa createContext succeeds
`createContext(window.__TAURI_INTERNALS__.ipc).context` returns a non-null eventa context. The context can perform `invoke` and `subscribe` operations without throwing.
Tool: agent-browser console
Evidence: console log "eventa context ok: true", no panic

### VAL-TAURI-IPC-002: All eventa invoke contracts route to Rust
The renderer can invoke every eventa invoke contract name that the current Electron backend exposes (`electron:window:*`, `electron:screen:*`, `electron:system-preferences:*`, `electron:app:*`, `electron:server-channel:*`, etc.). Each returns a valid response (not an error), even if the response data is a placeholder.
Tool: agent-browser console
Evidence: console log with status per contract name, no `not found` errors

### VAL-TAURI-IPC-003: Event subscriptions work
The renderer can subscribe to Tauri events (`electron:screen:cursor-screen-point`, `electron:window:bounds`, `electron:auto-updater:state-changed`). The backend emits events at the expected times.
Tool: agent-browser console
Evidence: console log showing received events

### VAL-TAURI-IPC-004: Cross-window events propagate
An event emitted from one window (e.g., a channel-server state change from the settings window) reaches other open windows (e.g., the channel-server status in the main page). The mechanism (`WebviewWindow::emit_to` or `emit_all`) delivers the payload.
Tool: agent-browser (two pages) + console
Evidence: console log on receiving window

---

## Area: Window Management (WIN)

### VAL-TAURI-WIN-001: Transparent main window
The main window is created with `transparent: true` and `decorations: false`. The window shows the character render on a transparent background (not a black or white rectangle behind the character).
Tool: agent-browser screenshot
Evidence: screenshot on standard desktop wallpaper showing transparent areas

### VAL-TAURI-WIN-002: Multi-window creation
Settings, chat, widgets, caption, notice, about, onboarding, devtools, beat-sync, inlay, dashboard windows can each be opened without crashing and render their expected content.
Tool: agent-browser navigation
Evidence: screenshot per window

### VAL-TAURI-WIN-003: Always-on-top floating
The main window has `always_on_top: true`. When other application windows are brought forward, the AIRI window remains on top.
Tool: agent-browser + manual verification
Evidence: screenshot showing AIRI window overlapping a file manager window

### VAL-TAURI-WIN-004: Multiple displays support
When the user has multiple displays, the AIRI window renders correctly on the display where it was opened (not always the primary one, unless programmed).
Tool: manual verification
Evidence: optional screenshot if multi-display available

---

## Area: Services (SRV)

### VAL-TAURI-SRV-001: Channel server starts and serves health check
The channel server async task starts during Tauri setup. `curl http://localhost:<port>/health` returns HTTP 200 with a JSON body.
Tool: curl
Evidence: terminal output `HTTP 200`, JSON body

### VAL-TAURI-SRV-002: Channel server QR code renders
The server-channel page in settings renders a QR code from the `electron:server-channel:get-qr-payload` invocation. The QR code encodes a valid URL to the channel server.
Tool: agent-browser screenshot (settings/connection page)
Evidence: screenshot of QR card

### VAL-TAURI-SRV-003: Plugin host sidecar starts
When running on desktop (with the sidecar binary available), the plugin-host sidecar launches and reports its status via the configured WebSocket/HTTP endpoint.
Tool: agent-browser screenshot (settings/plugins page)
Evidence: screenshot showing loaded plugin list, console-errors

### VAL-TAURI-SRV-004: Godot sidecar spawns
When running on desktop (with `$GODOT4` env exported or `godot-stage` binary available), the Godot stage sidecar starts and reports `booting | ready | degraded` status via the configured WebSocket endpoint.
Tool: agent-browser screenshot (settings/system/godot-stage)
Evidence: screenshot showing status, console-errors noting if binary missing

### VAL-TAURI-SRV-005: MCP server list loads
When MCP servers are configured in `<app_data_dir>/mcp.json`, the renderer can list them via `mcp_list_tools` without throwing.
Tool: agent-browser screenshot (settings/modules/mcp)
Evidence: screenshot showing server list

---

## Area: Plugin Host (PLGN)

### VAL-TAURI-PLGN-001: Plugin list page renders
The settings/plugins page shows the list of enabled plugins (even if empty). No `500` errors or thrown exceptions.
Tool: agent-browser screenshot
Evidence: screenshot, console-errors

### VAL-TAURI-PLGN-002: Plugin enable/disable toggles
A user can toggle a plugin's enabled state. The state persists across reload (via tauri-plugin-store or equivalent).
Tool: agent-browser interaction
Evidence: screenshot before/after toggling

---

## Area: Renderer Migration (RDR)

### VAL-TAURI-RDR-001: Character renders (VRM / Live2D / Spine)
The stage-ui-three, stage-ui-live2d, stage-ui-spine renderers work in the Tauri webview (no WebGL2 context lost, no shader compile errors). A loaded VRM / Live2D model is visible.
Tool: agent-browser screenshot
Evidence: screenshot, console-errors

### VAL-TAURI-RDR-002: Window store state persists
The `useElectronWindowBounds` composable (backed by the Tauri adapter) exposes reactive bounds that update on resize/move. The window lifecycle store reports correct `isMinimized/isVisible/isFocused` states.
Tool: agent-browser navigation + console
Evidence: console logs showing reactive state

### VAL-TAURI-RDR-003: Chat and settings pages load
The `/chat` and `/settings` routes render their full content without errors. All `<Suspense>`-wrapped async components resolve.
Tool: agent-browser navigation
Evidence: screenshot per page, console-errors

### VAL-TAURI-RDR-004: Caption window follows main window
When the user enables follow mode on the caption window, moving the main window causes the caption window to smoothly track its position.
Tool: agent-browser + manual main window drag
Evidence: screenshot of caption following main

### VAL-TAURI-RDR-005: Inlay HUD renders
The inlay window renders as a small transparent HUD centered horizontally near the bottom of the screen.
Tool: agent-browser screenshot
Evidence: screenshot

---

## Area: Screen Capture Replacement (SCRN)

### VAL-TAURI-SCRN-001: Use display media picker
When the user clicks "select screen" in the screen capture page, `navigator.mediaDevices.getDisplayMedia()` is invoked and the OS-native screen picker appears (or is granted automatically in test environments).
Tool: agent-browser interaction + console
Evidence: console log or screenshot

### VAL-TAURI-SCRN-002: Local inference packages are absent
The `@huggingface/transformers`, `onnxruntime-web`, `@xsai-transformers/*`, `@xsai/generate-speech`, `kokoro-js`, `@ricky0123/vad-web`, `libsamplerate-js`, `mediabunny` packages are not imported by any renderer file or listed in `apps/stage-tauri/package.json` dependencies.
Tool: grep
Evidence: terminal output showing 0 matches

---

## Area: Overlay & Click-Through (OVRL)

### VAL-TAURI-OVRL-001: Hitbox thread spawns on hover-sensitive windows
The background `rd-ev` (or equivalent) thread starts when a transparent window with hitbox click-through is created. The Rust side emits `device-mouse-move` events.
Tool: agent-browser + console
Evidence: console log showing `device-mouse-move` events

### VAL-TAURI-OVRL-002: Click-through toggles on non-element areas
When the cursor moves over a transparent area of the caption window (no DOM element), the Rust backend toggles `Window::set_ignore_cursor_events(true)`, and clicks pass through to the window below. When the cursor moves over a rendered element, click-through is disabled.
Tool: agent-browser + desktop interaction
Evidence: screenshot showing desktop behind caption; cursor interaction log

### VAL-TAURI-OVRL-003: Desktop overlay is gated
Without `AIRI_DESKTOP_OVERLAY=1`, no desktop overlay window is created. With it set, the overlay window appears.
Tool: env var toggle + screenshots
Evidence: screenshot with overlay visible, console log on env gate

---

## Area: Authentication (AUTH)

### VAL-TAURI-AUTH-001: Login starts OIDC flow
Clicking the auth "login" button invokes `auth_start_login`, which starts a loopback HTTP server on a random port and opens the system browser to the OIDC authorize URL.
Tool: agent-browser interaction
Evidence: screenshot of auth page, console-errors (browser may not open in CI; note manually)

### VAL-TAURI-AUTH-002: Logout clears session
After logging in (or with a valid session), clicking logout clears the stored token and resets the UI to logged-out state.
Tool: agent-browser screenshot
Evidence: before/after screenshots

---

## Area: Auto-Updater (UPD)

### VAL-TAURI-UPD-001: Updater page renders current version
The about/updater page shows the current app version and an update status indicator (even if it says "no updates").
Tool: agent-browser screenshot
Evidence: screenshot

### VAL-TAURI-UPD-002: Update check invokes backend
Clicking "check for updates" fires `auto_updater_check_for_updates` Rust command. The response populates the `isUpdateAvailable` state in the UI.
Tool: agent-browser interaction
Evidence: screenshot, console log showing check result

---

## Cross-Area Flows (CROSS)

Agent-browser + terminal

### VAL-CROSS-001: End-to-end user session
An anonymous (no-auth) user can:
1. Launch the Tauri app
2. See the character rendered on screen
3. Open the settings window
4. View the connection/server-channel config with QR code
5. Close settings and return to main window
6. Close the app via tray menu or window close

Tool: agent-browser
Evidence: series of screenshots, console-errors

### VAL-CROSS-002: Window lifecycle persistence
The main window size, position, and transparency state are preserved across app restarts.
Tool: agent-browser (relaunch)
Evidence: screenshot, terminal output

### VAL-CROSS-003: Channel server reachable from local network
A mobile device or second machine on the same LAN can access the channel server URL shown in the QR code.
Tool: curl from external (or same host bound to non-loopback)
Evidence: `HTTP 200` from curl to the LAN IP

### VAL-CROSS-004: No orphan processes on exit
After quitting the app (via tray or window close), no `cargo`, `rustc`, or other Rust-sidecar processes remain.
Tool: `ps aux | grep cargo` / `ps aux | grep airi-tauri`
Evidence: terminal output showing no remaining processes

---

## Non-Functional Requirements

### VAL-NFR-001: App startup under 30 seconds
From `cargo tauri dev` enter to interactive main window <= 30 seconds on a cold start.
Tool: terminal timing
Evidence: timestamp lines

### VAL-NFR-002: Idempotent init.sh
Running `bash init.sh` twice produces the same result (no errors, no duplicate files).
Tool: bash init.sh
Evidence: exit code 0 on second run

### VAL-NFR-003: Typecheck passes
`pnpm -F @proj-airi/stage-tauri typecheck` (or the equivalent workspace check) passes without errors after all ported files are in place.
Tool: pnpm typecheck
Evidence: terminal output, exit code
