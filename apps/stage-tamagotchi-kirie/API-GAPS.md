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
| GAP-009 | Main renderer | Initialize the Stage window lifecycle store | Electron `window:get-lifecycle-state` and `window:lifecycle-changed` contracts | Read and observe the host window's visibility, focus, and minimized state | Kirie Platform and AIRI host context | Resolved | Local Kirie workspace and real CEF verified |
| GAP-010 | Main renderer | Initialize the AIRI server channel | Electron server-channel configuration and lifecycle service | Own the AIRI server lifecycle outside Kirie Platform | AIRI desktop service | Blocked | AIRI sidecar artifact decision required |
| GAP-011 | Main renderer | Restore the saved locale | Electron `i18n:get-locale` and `i18n:set-locale` contracts | Use renderer storage in Kirie and keep the Electron fallback | AIRI host context | Resolved | Phase 6 locale review approved |
| GAP-012 | Main renderer | Open onboarding when initial setup is incomplete | Electron `windows:onboarding:open` contract | Open one reusable native onboarding window with follower state and close it from its renderer | AIRI window orchestration | Resolved | Phase 6 onboarding review approved |
| GAP-013 | Controls Island | Click an entry that opens Settings | Electron `windows:settings:open` contract | Open one reusable native settings window and navigate it to the requested settings route | AIRI window orchestration | Resolved | Real CEF runtime verified |
| GAP-014 | Controls Island | Open Chat | Electron `windows:chat:open` contract | Open one reusable native chat window with the minimal renderer runtime | AIRI window orchestration | Resolved | Real CEF runtime verified |
| GAP-015 | Controls Island | Close AIRI | Electron `app:quit` contract | Request a normal Godot scene-tree shutdown | AIRI application lifecycle | Resolved | Real CEF runtime verified |
| GAP-016 | Controls Island | Read microphone permission status | Electron `system-preferences:get-media-access-status` contract | Query the browser-owned microphone permission in Kirie while preserving the Electron RPC | AIRI host context | Blocked | Waiting for a real Godot CEF permission prompt |
| GAP-017 | Controls Island | Start microphone capture | Browser `getUserMedia({ audio: true })` behind Electron's WebContents permission policy | Resolve only trusted, same-origin microphone requests and deny every other WebView permission | Kirie low-level WebView API and AIRI host policy | Blocked | Waiting for a real Godot CEF permission prompt |
| GAP-018 | Controls Island | Enable fade on hover for the first time | Electron notice-window request and action contracts | Open the fade-on-hover tutorial in a native Godot window and return its confirmation result | AIRI window orchestration | Resolved | Real CEF runtime verified |
| GAP-019 | Controls Island, onboarding, and account settings | Start or cancel account sign-in | Electron OIDC service with a temporary loopback callback listener | Run PKCE sign-in through the system browser and preserve the existing auth events | AIRI authentication service | Resolved | Real CEF and independent review approved |
| GAP-020 | Main window | Render the Stage over the desktop | Electron creates a frameless transparent `BrowserWindow` | Preserve renderer alpha through CEF, the root viewport, and the native window | AIRI Godot project configuration | Resolved | Real Godot runtime and independent review approved |
| GAP-021 | Settings pages | Open an external link | Electron forwards new-window requests to `shell.openExternal` | Open trusted HTTP and HTTPS links with the system browser | Kirie Platform and AIRI host context | Resolved | Local Kirie workspace and real CEF verified; code review pending |
| GAP-022 | Data settings | Click `Open data folder` | Electron opens and returns its `userData` path | Open and return the current Godot application's data directory | Kirie Platform and AIRI host context | Resolved | Local Kirie workspace and real CEF verified; code review pending |
| GAP-023 | Main renderer and plugin settings | Initialize plugin tools | Electron owns the Node.js plugin host and its workers | Discover extensions and run plugin tools outside Kirie Platform | AIRI desktop service | Blocked | AIRI sidecar artifact decision required |

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
- Development dependency: AIRI links the sibling Kirie TypeScript packages and .NET projects.
- Runtime result: The renderer loaded the local lifecycle API without the former `onStateChanged is not a function` error.

## GAP-010 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true#/`.
- Original result: Godot reports the unregistered `eventa:invoke:electron:server-channel:get-config-send` request during application setup.
- Required result: AIRI owns its server configuration, process lifecycle, and errors outside Kirie Platform.
- Contract result: Kirie can preserve the existing get-config, apply-config, and QR-payload Eventa contracts. No Kirie Core or Platform API is required.
- Boundary finding: `@proj-airi/server-runtime` depends on Node.js listener and WebSocket APIs. The current Godot host does not embed Node.js, and AIRI does not publish a production sidecar with complete configuration, readiness, shutdown, and desktop packaging semantics.
- Controls Island result: The connection-status button reuses the Settings window and navigates it to `/settings/connection`. The page then reproduces the same blocked desktop service through `server-channel:get-qr-payload`; opening Settings itself does not require another Kirie API.
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

## GAP-013 evidence

- Input: Click the Controls Island button with `aria-label="Open settings"`.
- Original result: Godot reports the unregistered `eventa:invoke:electron:windows:settings:open-send` request, and no settings window opens.
- Required result: AIRI creates one native 600 by 800 Godot window with `synced-leader=false`. Later requests reuse, show, focus, and navigate that window.
- Ownership: This is AIRI application-window orchestration. It does not add a Kirie Platform or Kirie Core API.
- Runtime result: The control opened the native Settings window at `#/settings`. A connection-settings request reused that window and navigated it to `#/settings/connection`, including when both requests arrived before the settings renderer was ready. Native close removed the settings CEF page, and another request created the window again.

## GAP-014 evidence

- Input: Click the Controls Island button with `aria-label="Open Chat"`.
- Original result: Godot reports the unregistered `eventa:invoke:electron:windows:chat:open-send` request, and no chat window opens.
- Required result: AIRI creates one native 600 by 800 Godot window at `#/chat` with `stage-runtime=minimal` and `synced-leader=false`. Later requests reuse, show, and focus that window.
- Ownership: This is AIRI application-window orchestration. It does not add a Kirie Platform or Kirie Core API.
- Runtime result: Three concurrent requests kept one Chat CEF page. The rendered page exposed its Conversations, Mute voice, and Cancel reply controls. Native close removed the page, and another request created one new Chat page at the same minimal-runtime URL.

## GAP-015 evidence

- Input: Click the Controls Island button with `aria-label="Close"`.
- Original result: Godot reports the unregistered `eventa:invoke:electron:app:quit-send` request, and AIRI keeps running.
- Required result: The Kirie adapter preserves Electron's no-argument contract while sending an explicit empty payload to Godot. AIRI then requests a normal scene-tree shutdown.
- Ownership: This is AIRI application lifecycle behavior. It does not add a Kirie Platform or Kirie Core API.
- Runtime result: The control ended the Godot process and its child WebViews. The `kirie dev` command exited with status 0 without an unregistered quit request.

## GAP-016 evidence

- Input: Initialize the Controls Island microphone configuration.
- Original result: Kirie sends the Electron-only `eventa:invoke:electron:system-preferences:get-media-access-status-send` request, which Godot cannot handle.
- Required result: Electron keeps its native system-preferences query. Kirie reads the browser permission that owns its `getUserMedia` request and maps `prompt` to AIRI's existing `not-determined` state. The [W3C Permissions specification](https://www.w3.org/TR/permissions/) defines `granted`, `denied`, and `prompt` as the browser permission states.
- Ownership: This is an AIRI host-context adaptation. It does not add a Kirie Platform or Kirie Core API.
- Partial result: Godot CEF reported the microphone permission as `prompt`. The former unregistered system-preferences request was absent.
- Blocker: Godot CEF does not show and resolve a real user permission prompt. Keep this gap blocked until that prompt lifecycle exists.

## GAP-017 evidence

- Input: Enable microphone capture from the main Controls Island hearing UI.
- Original result: Godot CEF denied the browser request because its default permission policy is `DenyAll`.
- Required result: Kirie forwards each Godot CEF permission request without exposing `CefTexture`. AIRI grants only `microphone` for the exact renderer origin. It denies all other permission types and all requests from other origins or application windows.
- Configuration: `project.godot` selects Godot CEF's `Signal` permission policy. The [pinned Godot CEF settings source](https://github.com/dsh0416/godot-cef/blob/v1.15.3/crates/gdcef/src/settings.rs) defines `DenyAll:0,AllowAll:1,Signal:2` and defaults to `DenyAll`.
- Partial result: The trusted main renderer received a live built-in microphone track. The host denied untrusted microphone and geolocation requests.
- Blocker: AIRI currently resolves requests through host policy without a real user prompt. Keep this gap blocked until Godot CEF supplies that prompt.

## GAP-018 evidence

- Input: Enable fade on hover from the expanded Controls Island before the user has dismissed its tutorial.
- Original result: Godot reports the unregistered `eventa:invoke:open:electron:windows:notice-send` request.
- Required result: AIRI opens one native `1020 x 600` notice window, reports its pending request after the page mounts, and resolves the original request from the page's confirm, cancel, or close action.
- Ownership: This is AIRI window orchestration. It uses one Kirie WebView and Eventa context for the notice window. It does not add a Kirie Platform API.
- Runtime result: The Controls Island opened one native notice WebView at `#/notice/fade-on-hover?id=fade-on-hover`. The page received its pending request. Confirming destroyed the WebView, resolved the original request with `true`, and enabled the persisted fade-on-hover setting.

## GAP-019 evidence

- Input: Click **Sign in** from the Controls Island, onboarding page, or account settings.
- Original result: Godot reports the unregistered `eventa:invoke:electron:auth:start-login-send` request, and no browser opens.
- Required result: AIRI starts one temporary listener on `127.0.0.1`, generates an OIDC state and PKCE verifier, opens the system browser, validates the callback state, exchanges the code, and emits the existing token or error event. Logout cancels an unfinished attempt.
- Ownership: This is an AIRI application service. It does not add a Kirie Platform API or require the GAP-010 server sidecar.
- Configuration: The renderer sends its build-time server URL and client ID through the AIRI application context before login. The Godot host validates and uses that same configuration for authorization and token exchange.
- Security source: [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html) requires native apps to use an external user-agent and recommends PKCE and loopback redirects.
- Verification: A real Controls Island click started the loopback listener and opened AIRI's sign-in page in the system browser. Focused tests verified successful callbacks, state rejection without consuming the listener, and relay CORS. The test did not enter account credentials or complete a live token exchange.

## GAP-020 evidence

- Input: Start the main Stage window with a transparent renderer background.
- Original result: Kirie made the CEF background transparent, but the Godot root viewport and native window stayed opaque.
- Required result: AIRI creates a frameless main window and preserves each transparent renderer pixel through the full native stack.
- Kirie capability: The Godot CEF backend already uses `Color.TRANSPARENT` before it enters the scene tree.
- Godot source: [ProjectSettings 4.7 documentation](https://docs.godotengine.org/en/4.7/classes/class_projectsettings.html#class-projectsettings-property-display-window-size-transparent).
- Runtime result: Godot reported available per-pixel transparency, a transparent main window, a transparent root viewport, and a borderless main window.
- Review result: The project settings affect only the main window. Existing auxiliary `Window` scenes keep their opaque default.

## GAP-021 evidence

- Input: Open an external settings link through `window.open()` or an anchor with `target="_blank"`.
- Original result: Godot CEF returns `null` from `window.open()` and does not open a browser.
- Godot CEF source: [Popup policy documentation](https://github.com/dsh0416/godot-cef/blob/v1.15.3/docs/api/properties.md#popup-policy).
- Required result: AIRI sends trusted HTTP and HTTPS links to the user's system browser.
- Kirie capability: The Platform working tree provides `openExternalUrl()` through the shared Eventa context and Godot's `OS.shell_open()`.
- Kirie runtime result: The real Godot host opened the Kirie repository in the system Chrome browser and returned success to the example renderer.
- Development dependency: AIRI links the sibling Kirie TypeScript packages and .NET projects.
- AIRI integration: The Kirie renderer routes external HTTP and HTTPS links through `openExternalUrl()`.
- Runtime result: A real `window.open()` request opened the AIRI repository in the system Chrome browser.
- Review result: Awaiting user code review.

## GAP-022 evidence

- Input: Click **Open data folder** in desktop data settings.
- Original result: The Kirie renderer returns before invoking any host capability. The button has no effect.
- Required result: Open the current AIRI application data directory and return its absolute path.
- Kirie capability: The Platform working tree provides `openApplicationDataDirectory()` through the shared Eventa context.
- Godot source: [Godot 4.7 `OS.get_user_data_dir()`](https://docs.godotengine.org/en/4.7/classes/class_os.html#class-os-method-get-user-data-dir).
- Kirie runtime result: The real Godot host opened the example's application data directory and returned its absolute path to the renderer.
- Development dependency: AIRI links the sibling Kirie TypeScript packages and .NET projects.
- AIRI integration: The data settings action calls `openApplicationDataDirectory()` in Kirie.
- Runtime result: The real data settings button opened the `AIRI` application data directory in Finder.
- Project identity: AIRI sets Godot's application name to `AIRI`, so the default project-specific data directory no longer uses `Kirie Basic`.
- Review result: Awaiting user code review.

## GAP-023 evidence

- Input: Start the full Stage runtime in Kirie.
- Original result: Godot reports the unregistered `eventa:invoke:electron:plugins:tools:list-xsai-send` request.
- Required result: AIRI discovers installed extensions and runs their tools through the existing renderer contracts.
- Boundary finding: The Electron plugin host uses Node.js files, paths, workers, and runtime loading. These capabilities do not belong in Kirie Platform.
- Current decision: Block implementation until the AIRI sidecar owns plugin discovery, worker lifecycle, shutdown, and desktop packaging.
