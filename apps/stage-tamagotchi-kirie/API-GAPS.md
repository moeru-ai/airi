# Kirie API gaps

This log contains only errors reproduced with the Stage Tamagotchi renderer in the Kirie desktop host.

Model rendering, model assets, Live2D, VRM, and MMD are outside the current scope.

| ID | Page | Trigger | Existing Electron API | Required behavior | Owner | Status | Review |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GAP-001 | Main renderer | Open the first Kirie window | Electron window creation adds `synced-leader` | The first Kirie window receives an explicit leader state before Pinia setup | AIRI host context | Resolved | Gate 4 approved |
| GAP-002 | Main renderer | Mount `ResizeHandler` in Kirie | `useElectronWindowResize` calls Electron `app.isWindows` and `window.resize` | Resize handling uses the shared host context and the existing Kirie Platform resize API | AIRI host context | Resolved | Phase 5 resize review approved |
| GAP-003 | Main renderer | Mount the main Stage page in Kirie | Electron mouse composables create their own Electron Eventa context | Pointer state comes from the shared host context and existing Kirie Platform pointer APIs | AIRI host context | Resolved | Phase 5 pointer review approved |
| GAP-004 | Controls Island | Mount `ControlsIslandRoot` in Kirie | `useElectronAllDisplays` and `useElectronWindowBounds` create an Electron Eventa context | Island placement uses shared host window and current-display bounds | AIRI host context | Resolved | Phase 5 displays review approved |
| GAP-005 | Controls Island | Mount controls and apply saved window state | Electron `app.isLinux`, `window.set-always-on-top`, and drag contracts | Select the move mechanism without Electron IPC and use Kirie Platform for native movement and always-on-top state | AIRI host context | Resolved | Phase 5 window actions review approved |
| GAP-006 | Controls Island and data settings | Click `Move to screen center` | Electron `windows:main:center` contract | Center the Godot host window on its current display | AIRI host context | Resolved | Phase 5 centering review approved |
| GAP-007 | Window shortcut settings | Open the Spotlight shortcut page | Electron `windows:spotlight:shortcut:get` contract | Store the Spotlight shortcut and open its application window when the shortcut fires | AIRI window orchestration | Deferred | User-directed scope exclusion |
| GAP-008 | Global shortcut devtools | Open the global shortcut page | Electron shortcut list, register, unregister, and trigger contracts | Manage renderer-owned shortcuts through the existing Kirie Platform shortcut API | AIRI host context | Resolved | Phase 5 global shortcuts review approved |
| GAP-009 | Main renderer | Initialize the Stage window lifecycle store | Electron `window:get-lifecycle-state` and `window:lifecycle-changed` contracts | Read and observe the host window's visibility, focus, and minimized state | Kirie Platform and AIRI host context | Resolved | Phase 6 lifecycle review approved |
| GAP-010 | Main renderer | Initialize the AIRI server channel | Electron server-channel configuration and lifecycle service | Own the AIRI server lifecycle outside Kirie Platform | AIRI desktop service | Blocked | AIRI sidecar artifact decision required |
| GAP-011 | Main renderer | Restore the saved locale | Electron `i18n:get-locale` and `i18n:set-locale` contracts | Use renderer storage in Kirie and keep the Electron fallback | AIRI host context | Resolved | Phase 6 locale review approved |
| GAP-012 | Main renderer | Open onboarding when initial setup is incomplete | Electron `windows:onboarding:open` contract | Open one reusable native onboarding window with follower state and close it from its renderer | AIRI window orchestration | Resolved | Phase 6 onboarding review approved |

## GAP-001 evidence

- Original input: `http://127.0.0.1:5174/`
- Original result: `TypeError: Missing synced-leader query`
- Source: `src-web/src/renderer/window-context.ts:39`
- Resolved input: `http://127.0.0.1:5174/?synced-leader=true`
- Resolved result: The renderer initializes one Kirie Eventa context and completes `hostWindow.getBounds()` through Godot.

## GAP-002 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true`
- Original result: `useElectronWindowResize` requested `window.electron.ipcRenderer` during `ResizeHandler` setup.
- Original error: `Electron ipcRenderer is not available.`
- Existing Kirie capability: `PlatformClient.hostWindow.beginResize`.
- Resolved result: `ResizeHandler` borrows the AIRI host context; runtime execution proceeds to the main-page pointer setup.

## GAP-003 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true#/`
- Original result: `useElectronMouseInWindow` called `useElectronMouseEventTarget`, which requested `window.electron.ipcRenderer`.
- Original error: `Electron ipcRenderer is not available.`
- Existing Kirie capabilities: `PlatformClient.hostWindow.getPointerPosition`, `getBounds`, and `setPointerPassthrough`.
- Resolved result: Main-page and caption pointer state borrow one AIRI host context. Runtime execution proceeds to Controls Island display discovery.

## GAP-004 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true#/`
- Original result: `ControlsIslandRoot` called `useElectronAllDisplays`, which requested `window.electron.ipcRenderer`.
- Original error: `Electron ipcRenderer is not available.`
- Existing Kirie capabilities: `PlatformClient.hostWindow.getBounds` and `getCurrentDisplayBounds`.
- Resolution: Kirie uses its current display as both the full and usable display area. Electron continues to return all Electron displays through the shared Eventa context.

## GAP-005 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true#/`
- Original result: Controls Island emitted unregistered Electron `app.isLinux` and `window.set-always-on-top` requests during setup.
- Existing Kirie capabilities: `PlatformClient.hostWindow.beginMove` and `setAlwaysOnTop`.
- Required result: Kirie selects native movement from its runtime metadata and applies saved always-on-top state through Platform.
- Resolved result: A clean CEF reload completes the Kirie round trip without either original Electron request or an unhandled browser exception.

## GAP-006 evidence

- Input: Click the Controls Island button with `aria-label="Move to screen center"`.
- Original result: Godot reports the unregistered `eventa:invoke:electron:windows:main:center-send` request.
- Existing Kirie capability: `PlatformClient.hostWindow.centerOnCurrentDisplay`.
- Required result: Both Controls Island and data settings center the host through the platform-neutral AIRI boundary.
- Resolved result: A CDP-triggered button click completed without a browser error and moved the real Godot window from `(1178, 884)` to `(1224, 846)`.

## GAP-007 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true#/settings/system/window-shortcuts`.
- Original result: Godot reports the unregistered `eventa:invoke:electron:windows:spotlight:shortcut:get-send` request.
- Current decision: Defer all Spotlight shortcut, window, and notification work until the user explicitly reopens this scope.

## GAP-008 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true#/devtools/global-shortcut`.
- Original result: Godot reports the unregistered `eventa:invoke:electron:shortcut:list-send` request during page setup.
- Existing Kirie capabilities: `PlatformClient.globalShortcuts.register` and `unregister`.
- Required result: The page registers, lists, receives events from, and unregisters renderer-owned shortcuts without Electron IPC.
- Key mapping source: [Godot 4.7 `Key` enum](https://github.com/godotengine/godot/blob/4.7/core/os/keyboard.h).
- Resolved result: The real Godot host registered `Ctrl+Shift+K`, the page listed one active binding, and unregister-all returned the list to zero without an Electron shortcut request.

## GAP-009 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true#/`.
- Original result: Godot reports the unregistered `eventa:invoke:electron:window:get-lifecycle-state-send` request during application setup.
- Required result: The lifecycle store gets an initial native window snapshot and receives later visibility, focus, and minimized-state changes without Electron IPC.
- Godot source: [Window 4.7 documentation](https://docs.godotengine.org/en/4.7/classes/class_window.html).
- Sampling source: [SceneTree 4.7 `process_frame` signal](https://docs.godotengine.org/en/4.7/classes/class_scenetree.html#class-scenetree-signal-process-frame).
- Resolved result: The initial snapshot reported a focused and visible window. Native minimize and restore actions emitted matching AIRI lifecycle reasons.

## GAP-010 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true#/`.
- Original result: Godot reports the unregistered `eventa:invoke:electron:server-channel:get-config-send` request during application setup.
- Required result: AIRI owns its server configuration, process lifecycle, and errors outside Kirie Platform.
- Contract result: Kirie can preserve the existing get-config, apply-config, and QR-payload Eventa contracts. No Kirie Core or Platform API is required.
- Boundary finding: `@proj-airi/server-runtime` depends on Node.js listener and WebSocket APIs. The current Godot host does not embed Node.js, and AIRI does not publish a production sidecar with complete configuration, readiness, shutdown, and desktop packaging semantics.
- Rejected workaround: Do not port the AIRI protocol to C#, bundle it into the browser renderer, or treat the workspace-only Node.js command as a production implementation.
- Current decision: Block implementation until AIRI defines a supported sidecar artifact and control contract, or the product explicitly accepts a user-managed external server with reduced behavior.

## GAP-011 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true#/`.
- Original result: Godot reports the unregistered `eventa:invoke:electron:i18n:get-locale-send` request during locale restoration.
- Required result: Kirie reads and writes the renderer locale without Electron IPC. Electron keeps its main-process persistence fallback.
- Runtime result: CEF read `en`, wrote the same locale, and read `en` again through the Kirie adapter. Godot did not receive an Electron i18n request.

## GAP-012 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true#/` with onboarding required.
- Original result: Godot reports the unregistered `eventa:invoke:electron:windows:onboarding:open-send` request when the main page mounts.
- Required result: AIRI creates one native Godot onboarding window at `#/onboarding` with `synced-leader=false`. Later open requests reuse, show, and focus that window. The onboarding renderer can close it through the existing close contract.
- Ownership: This is AIRI application-window orchestration. It does not add a Kirie Platform or Kirie Core API.
- Runtime result: CEF showed one leader page and one follower onboarding page. A repeated open kept two pages. Closing onboarding removed only the follower page, and a later open created it again.
