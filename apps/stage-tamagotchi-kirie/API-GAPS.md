# Kirie API gaps

This log contains only errors reproduced with the Stage Tamagotchi renderer in
the Kirie desktop host. The evidence was last verified on 2026-09-17 with
Godot 4.7.1, Kirie 0.3.0, and the configured Godot CEF 1.15.4 backend.

Model rendering, model assets, Live2D, VRM, and MMD are outside the current scope.

The status values have these meanings:

- `Accepted`: Implementation, runtime verification, and required review are complete.
- `Review pending`: Implementation and runtime verification are complete. Review is not complete.
- `Runtime verification pending`: Implementation and review are complete. A required live flow is not complete.
- `Open`: AIRI reproduced the gap, but implementation work has not started.
- `Blocked`: A named external or product decision prevents implementation or acceptance.
- `Deferred`: The gap is outside the current migration milestone.

| ID | Page | Trigger | Existing Electron API | Required behavior | Owner | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GAP-001 | Main renderer | Open the first Kirie window | Electron window creation adds `synced-leader` | The first Kirie window receives an explicit leader state before Pinia setup | AIRI host context | Accepted | Gate 4 approved |
| GAP-002 | Main renderer | Resize the borderless Kirie window | Electron mounts DOM resize handles and sends resize deltas over IPC | Godot detects native window edges and starts native resize operations | AIRI Godot host | Accepted | Native resize regression tests pass |
| GAP-003 | Main renderer | Mount the main Stage page in Kirie | Electron mouse composables create their own Electron Eventa context | Pointer state comes from the shared host context and existing Kirie Platform pointer APIs | AIRI host context | Accepted | Phase 5 pointer review approved |
| GAP-004 | Controls Island | Mount `ControlsIslandRoot` in Kirie | `useElectronAllDisplays` and `useElectronWindowBounds` create an Electron Eventa context | The AIRI host returns one atomic current-display snapshot for island placement | AIRI Godot host and host context | Accepted | Phase 5 displays review approved |
| GAP-005 | Controls Island | Mount controls and apply saved window state | Electron `app.isLinux`, `window.set-always-on-top`, and drag contracts | Select the move mechanism without Electron IPC and use Kirie Platform for native movement and always-on-top state | AIRI host context | Accepted | Phase 5 window actions review approved |
| GAP-006 | Controls Island and data settings | Click `Move to screen center` | Electron `windows:main:center` contract | Center the Godot host window on its current display | AIRI host context | Accepted | Phase 5 centering review approved |
| GAP-007 | Window shortcut settings | Open the Spotlight shortcut page | Electron `windows:spotlight:shortcut:get` contract | Store the Spotlight shortcut and open its application window when the shortcut fires | AIRI window orchestration | Deferred | User-directed scope exclusion |
| GAP-008 | Global shortcut devtools | Open the global shortcut page | Electron shortcut list, register, unregister, and trigger contracts | Manage renderer-owned shortcuts through the existing Kirie Platform shortcut API | AIRI host context | Accepted | Phase 5 global shortcuts review approved |
| GAP-009 | Main renderer | Initialize the Stage window lifecycle store | Electron `window:get-lifecycle-state` and `window:lifecycle-changed` contracts | Read and observe the host window's visibility, focus, and minimized state | Kirie Platform and AIRI host context | Accepted | Kirie 0.3.0 and real CEF verified |
| GAP-010 | Full Stage runtime windows | Initialize the AIRI server channel | Electron server-channel configuration and lifecycle service | Own the AIRI server lifecycle outside Kirie Platform | AIRI desktop service | Blocked | AIRI sidecar artifact decision required |
| GAP-011 | Main renderer | Restore the saved locale | Electron `i18n:get-locale` and `i18n:set-locale` contracts | Use renderer storage in Kirie and keep the Electron fallback | AIRI host context | Accepted | Phase 6 locale review approved |
| GAP-012 | Main renderer | Open onboarding when initial setup is incomplete | Electron `windows:onboarding:open` contract | Open one reusable native onboarding window with follower state and close it from its renderer | AIRI window orchestration | Accepted | Phase 6 onboarding review approved |
| GAP-013 | Controls Island | Click an entry that opens Settings | Electron `windows:settings:open` contract | Open one reusable native settings window and navigate it to the requested settings route | AIRI window orchestration | Accepted | Real CEF runtime verified |
| GAP-014 | Controls Island | Open Chat | Electron `windows:chat:open` contract | Open one reusable native chat window with the minimal renderer runtime | AIRI window orchestration | Accepted | Real CEF runtime verified |
| GAP-015 | Controls Island | Close AIRI | Electron `app:quit` contract | Request a normal Godot scene-tree shutdown | AIRI application lifecycle | Accepted | Real CEF runtime verified |
| GAP-016 | Controls Island and permission settings | Read or reset microphone permission status | Electron `system-preferences:get-media-access-status` contract | Use AIRI-owned persistent permission state in Kirie while preserving the Electron RPC | AIRI Godot host and host context | Accepted | Persistent grant, denial, reset, and stream shutdown verified; UI review approved |
| GAP-017 | Main renderer | Start microphone capture | Browser `getUserMedia({ audio: true })` behind Electron's WebContents permission policy | Ask in the AIRI Renderer, persist the decision, resolve trusted same-origin requests, and deny every other WebView permission | AIRI Godot host and Renderer | Accepted | Allow, repeated allow, revoke, and deny verified in real CEF; permission dialog review approved |
| GAP-018 | Controls Island | Enable fade on hover for the first time | Electron notice-window request and action contracts | Open the fade-on-hover tutorial in a native Godot window and return its confirmation result | AIRI window orchestration | Accepted | Real CEF runtime verified |
| GAP-019 | Controls Island, onboarding, and account settings | Start or cancel account sign-in | Electron OIDC service with a temporary loopback callback listener | Run PKCE sign-in through the system browser and preserve the existing auth events | AIRI authentication service | Accepted | Live OIDC token exchange and session verified |
| GAP-020 | Main window | Render the Stage over the desktop | Electron creates a frameless transparent `BrowserWindow` | Preserve renderer alpha through CEF, the root viewport, and the native window | AIRI Godot project configuration | Accepted | Real Godot runtime and independent review approved |
| GAP-021 | Settings pages | Open an external link | Electron forwards new-window requests to `shell.openExternal` | Open external HTTP and HTTPS links with the system browser | Kirie Platform and AIRI host context | Accepted | Code, tests, and real CEF runtime approved |
| GAP-022 | Data settings | Click `Open data folder` | Electron opens and returns its `userData` path | Open the current Godot application data directory | Kirie Platform and AIRI host context | Accepted | Code, tests, and real CEF runtime approved |
| GAP-023 | Main renderer, plugin settings, and extension widgets | Initialize or manage plugins | Electron owns the Node.js plugin host and its workers | Discover, inspect, enable, load, and unload extensions and run their tools outside Kirie Platform | AIRI desktop service | Blocked | AIRI sidecar artifact decision required |
| GAP-024 | Main, onboarding, and Artistry consumers | Initialize or use Artistry | Electron owns Artistry configuration, connection tests, and headless generation | Define and own the Artistry service outside the Electron main process | AIRI desktop service | Open | Configuration-sync error reproduced on 2026-09-17 |
| GAP-025 | MCP settings and MCP tool consumers | Open MCP settings | Electron owns the MCP configuration file and Node.js stdio server processes | Persist MCP configuration, manage stdio server lifecycles, and expose tool discovery and invocation outside Kirie Platform | AIRI desktop service | Blocked | AIRI sidecar artifact decision required |
| GAP-026 | About and updater devtools | Open the About page | `useElectronAutoUpdater` creates its own Electron Eventa context and Electron owns update preferences and lifecycle | Mount updater UI through the shared host context and define AIRI update check, download, install, state, and preference behavior | AIRI renderer bridge and desktop update service | Open | `Electron ipcRenderer is not available` reproduced on 2026-09-17 |
| GAP-027 | Developer settings | Open main DevTools, the editor, or a standalone devtools page | Electron opens WebContents DevTools and dedicated `BrowserWindow` instances | Provide equivalent Kirie development tools or hide actions that the host does not support | AIRI developer tooling and window orchestration | Open | Three unregistered window requests reproduced on 2026-09-17 |

## Audited but not reproduced

Static references do not become ledger gaps until an in-scope runtime flow
reproduces a failure. The 2026-09-17 audit found these remaining surfaces:

- `electronStartTrackMousePosition` runs after server-channel initialization.
  GAP-010 currently stops the full-runtime setup before this request.
- Widget-window contracts and desktop-overlay readiness have not run in Kirie.
- The inlay route still references Electron platform checks, vibrancy, background
  material, and window bounds. The Kirie host does not currently create this
  application window.
- Display-model rendering and `godot-stage` contracts remain outside the
  migration scope.

## GAP-001 evidence

- Original input: `http://127.0.0.1:5174/`
- Original result: `TypeError: Missing synced-leader query`
- Source: `src-web/src/renderer/window-context.ts:39`
- Accepted input: `http://127.0.0.1:5174/?synced-leader=true`
- Accepted result: The renderer initializes one Kirie Eventa context and completes `hostWindow.getBounds()` through Godot.

## GAP-002 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true`
- Original result: `useElectronWindowResize` requested `window.electron.ipcRenderer` during `ResizeHandler` setup.
- Original error: `Electron ipcRenderer is not available.`
- Existing Godot capabilities: `WindowInput` and `Window.StartResize`.
- Accepted result: Godot owns edge hit testing, resize cursors, and native resize operations. The Kirie renderer has no DOM resize handles.

## GAP-003 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true#/`
- Original result: `useElectronMouseInWindow` called `useElectronMouseEventTarget`, which requested `window.electron.ipcRenderer`.
- Original error: `Electron ipcRenderer is not available.`
- Existing Kirie capabilities: `PlatformClient.hostWindow.getPointerPosition`, `getBounds`, and `setPointerPassthrough`.
- Accepted result: Main-page and caption pointer state borrow one AIRI host context. Runtime execution proceeds to Controls Island display discovery.

## GAP-004 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true#/`
- Original result: `ControlsIslandRoot` called `useElectronAllDisplays`, which requested `window.electron.ipcRenderer`.
- Original error: `Electron ipcRenderer is not available.`
- Existing Godot capabilities: `ScreenGetPosition`, `ScreenGetSize`, and `ScreenGetUsableRect`.
- Resolution: AIRI registers `airiGetCurrentDisplaySnapshot` on its Godot host and returns one atomic native snapshot containing full bounds, usable bounds, and display scale. This is an AIRI application contract, not a Kirie Platform API. Electron continues to return all Electron displays through the shared Eventa context.

## GAP-005 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true#/`
- Original result: Controls Island emitted unregistered Electron `app.isLinux` and `window.set-always-on-top` requests during setup.
- Existing Kirie capabilities: `PlatformClient.hostWindow.beginMove` and `setAlwaysOnTop`.
- Required result: Kirie selects native movement from its runtime metadata and applies saved always-on-top state through Platform.
- Accepted result: A clean CEF reload completes the Kirie round trip without either original Electron request or an unhandled browser exception.

## GAP-006 evidence

- Input: Click the Controls Island button with `aria-label="Move to screen center"`.
- Original result: Godot reports the unregistered `eventa:invoke:electron:windows:main:center-send` request.
- Existing Kirie capability: `PlatformClient.hostWindow.centerOnCurrentDisplay`.
- Required result: Both Controls Island and data settings center the host through the platform-neutral AIRI boundary.
- Accepted result: A CDP-triggered button click completed without a browser error and moved the real Godot window from `(1178, 884)` to `(1224, 846)`.

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
- Accepted result: The real Godot host registered `Ctrl+Shift+K`, the page listed one active binding, and unregister-all returned the list to zero without an Electron shortcut request.

## GAP-009 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true#/`.
- Original result: Godot reports the unregistered `eventa:invoke:electron:window:get-lifecycle-state-send` request during application setup.
- Required result: The lifecycle store gets an initial native window snapshot and receives later visibility, focus, and minimized-state changes without Electron IPC.
- Godot source: [Window 4.7 documentation](https://docs.godotengine.org/en/4.7/classes/class_window.html).
- Sampling source: [SceneTree 4.7 `process_frame` signal](https://docs.godotengine.org/en/4.7/classes/class_scenetree.html#class-scenetree-signal-process-frame).
- Accepted result: The initial snapshot reported a focused and visible window. Native minimize and restore actions emitted matching AIRI lifecycle reasons.
- Dependency result: AIRI uses the coordinated Kirie 0.3.0 npm and NuGet packages.
- Runtime result: The renderer loaded the published lifecycle API without the former `onStateChanged is not a function` error.

## GAP-010 evidence

- Input: `http://127.0.0.1:5174/?synced-leader=true#/`.
- Original result: Godot reports the unregistered `eventa:invoke:electron:server-channel:get-config-send` request during application setup.
- Affected renderers: The main and onboarding renderers reproduced the request on 2026-09-17. Settings and notice also select the full Stage runtime in `window-context.ts`, but they did not reproduce this request in the latest session. Chat explicitly selects the minimal runtime.
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
- Required result: Electron keeps its native system-preferences query. Kirie reads `not-determined`, `granted`, or `denied` from the AIRI Godot host. AIRI keeps the decision until the user resets it in Settings.
- Ownership: The Godot host owns persistence and the renderer host context exposes reactive state. The browser Permissions API is not the source of truth in Kirie.
- Host result: AIRI stores the microphone decision in `user://permissions.cfg`. The permission settings page reads and resets this state through typed Eventa contracts. Resetting a grant stops the active renderer microphone stream.
- Cross-version result: On 2026-09-17, isolated runs with the official Godot CEF
  1.15.3 and 1.15.4 macOS releases both forwarded the request and accepted
  AIRI's grant. Neither run showed the macOS consent prompt, changed the browser
  permission from `prompt`, or added AIRI to the macOS microphone permission
  list.
- Runtime result: Allow changed AIRI state to `granted`; the settings page showed `Allowed`; reset changed it to `not-determined`; Deny changed it to `denied`; a final reset left the test environment at `not-determined`.
- Contract result: CEF still reports `prompt`. Kirie only exposes request-scoped resolution, so AIRI owns the persistent application decision.
- Review result: Runtime verification and UI review are complete.

## GAP-017 evidence

- Input: Enable microphone capture from the main Controls Island hearing UI.
- Original result: Godot CEF denied the browser request because its default permission policy is `DenyAll`.
- Required result: Kirie forwards each Godot CEF permission request without exposing `CefTexture`. AIRI validates the permission type and exact renderer origin, then asks through a modal inside the main Renderer. It denies all other permission types and all requests from other origins or application windows.
- Configuration: `project.godot` selects Godot CEF's `Signal` permission policy. The [pinned Godot CEF settings source](https://github.com/dsh0416/godot-cef/blob/v1.15.4/crates/gdcef/src/settings.rs) defines `DenyAll:0,AllowAll:1,Signal:2` and defaults to `DenyAll`.
- Permission source: Godot CEF keeps each request pending until the application calls its [grant or deny method](https://github.com/dsh0416/godot-cef/blob/v1.15.4/docs/api/methods.md#permission-handling).
- Dependency result: Kirie 0.3.0 exposes `PermissionRequested`, `GrantPermission()`, and `DenyPermission()`. AIRI's addon matches the current Kirie source.
- Policy result: The host coalesces concurrent native request IDs behind one opaque renderer prompt ID. Closing or denying the modal denies the request. A two-minute timeout and host shutdown also deny pending requests.
- Runtime result: Allow returned a live audio track, which the test stopped immediately. A second request completed without another modal. Reset caused the next request to show the modal again. Deny returned `NotAllowedError`.
- Permission result: The modal uses the screen-capture dialog shade and blur. The overlay follows the rounded Stage boundary, and the card uses the existing AIRI dialog shadow.
- Artifact result: The installed Godot CEF application still fails strict code-signature verification. This remains a separate migration acceptance item.
- Review result: Runtime verification and UI review are complete.

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
- Redirect flow: The authorization request uses the server's `/api/auth/oidc/electron-callback` endpoint. The state carries the loopback port and nonce so that the server can relay the result to the temporary local `/callback` listener.
- Security source: [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html) requires native apps to use an external user-agent and recommends PKCE and loopback redirects.
- Runtime result: A real Controls Island sign-in completed on 2026-09-17. The hosted callback page reported that AIRI received the sign-in result.
- Token result: CEF stored the access token, refresh token, ID token, client ID, and future expiry. No token value was recorded in this document.
- State result: The temporary OIDC flow state and parameters were absent after completion.
- Session result: The authenticated session request returned `200` with a user, a session, and a session expiry.
- Test result: The C# test executable passed. The focused renderer host-context tests passed with two tests.
- Security result: Focused tests cover the loopback callback, forged-state rejection without consuming the listener, and relay CORS.
- Review result: Approved on 2026-09-17 with no blocking findings.

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
- Godot CEF source: [Popup policy documentation](https://github.com/dsh0416/godot-cef/blob/v1.15.4/docs/api/properties.md#popup-policy).
- Required result: AIRI sends external HTTP and HTTPS links to the user's system browser.
- Kirie capability: Kirie 0.3.0 provides `openExternalUrl()` through the shared Eventa context and Godot's `OS.shell_open()`.
- Kirie runtime result: The real Godot host opened the Kirie repository in the system Chrome browser and returned success to the example renderer.
- Dependency result: AIRI uses the coordinated Kirie 0.3.0 npm and NuGet packages.
- AIRI integration: The Kirie renderer routes external HTTP and HTTPS links through `openExternalUrl()`.
- Runtime result: A real `window.open()` request opened the AIRI repository in the system Chrome browser.
- Security result: AIRI filters non-HTTP schemes. Kirie Platform validates the absolute URL again before it calls `OS.shell_open()`.
- Error result: Kirie Platform returns operating-system errors through Eventa. The renderer catches asynchronous link-opening errors and reports them.
- Lifecycle result: The renderer installs the handler only for Kirie. It restores `window.open` and removes the click listener during page shutdown or hot reload.
- Test result: The browser tests cover anchor clicks, `window.open()`, same-origin navigation, and `window.open` restoration. A live `file:` request failed at the host boundary.
- Review result: Approved on 2026-09-17 with no blocking findings.

## GAP-022 evidence

- Input: Click **Open data folder** in desktop data settings.
- Original result: The Kirie renderer returns before invoking any host capability. The button has no effect.
- Required result: Open the current AIRI application data directory.
- Kirie capability: Kirie 0.3.0 provides `openApplicationDataDirectory()` through the shared Eventa context.
- Godot source: [Godot 4.7 `OS.get_user_data_dir()`](https://docs.godotengine.org/en/4.7/classes/class_os.html#class-os-method-get-user-data-dir).
- Kirie runtime result: The real Godot host opened the example's application data directory and returned its absolute path to the renderer.
- Dependency result: AIRI uses the coordinated Kirie 0.3.0 npm and NuGet packages.
- AIRI integration: The data settings action calls `openApplicationDataDirectory()` in Kirie.
- Runtime result: The real data settings button opened the `AIRI` application data directory in Finder.
- Project identity: AIRI sets Godot's application name to `AIRI`, so the default project-specific data directory no longer uses `Kirie Basic`.
- AIRI contract: The current AIRI adapter returns `Promise<void>` because its caller only needs the open operation.
- Security result: The platform contract accepts no path. The Godot host selects `OS.get_user_data_dir()` and propagates `OS.shell_open()` errors.
- Caller result: The settings component awaits the operation and sends failures to its existing status handler.
- Test result: The focused host-context tests passed. The live platform response ended with `Godot/app_userdata/AIRI`.
- Review result: Approved on 2026-09-17 with no blocking findings.

## GAP-023 evidence

- Input: Start the full Stage runtime in Kirie.
- Original result: Godot reports the unregistered `eventa:invoke:electron:plugins:tools:list-xsai-send` request.
- Timeout result: After five seconds, the renderer sends `plugins:tools:list-xsai-send-abort`; Godot also rejects this unregistered cancellation envelope.
- Required result: AIRI discovers, inspects, enables, loads, and unloads installed extensions and runs their tools through the existing renderer contracts.
- Contract audit: `App.vue`, the plugin tool store, and extension widgets also reference plugin list, enable, auto-reload, load-enabled, load, unload, inspect, capability update, tool invocation, and asset-base-URL contracts. The latest session did not reach each contract separately; they are part of this one plugin-host boundary.
- Electron source: [plugin host](../stage-tamagotchi/src/main/services/airi/plugins/index.ts).
- Boundary finding: The Electron plugin host uses Node.js files, paths, workers, and runtime loading. These capabilities do not belong in Kirie Platform.
- Current decision: Block implementation until the AIRI sidecar owns plugin discovery, worker lifecycle, shutdown, and desktop packaging.

## GAP-024 evidence

- Input: Start the full Stage runtime in Kirie.
- Original result: Godot reports the unregistered `eventa:invoke:electron:artistry:sync-config-send` request.
- Affected renderers: The main and onboarding renderers reproduced the request.
- Required result: AIRI defines the owner, storage, synchronization, connection testing, and headless-generation behavior for Artistry outside Electron.
- Contract audit: `@proj-airi/stage-shared` defines configuration sync, ComfyUI connection testing, and headless generation. Only configuration sync reproduced a runtime error in the latest session.
- Electron source: [Artistry bridge](../stage-tamagotchi/src/main/services/airi/widgets/artistry-bridge.ts).
- Boundary finding: This service belongs to AIRI. It does not belong in Kirie Core or Kirie Platform.
- Current decision: Keep the gap open until AIRI selects the service boundary and persistence owner.

## GAP-025 evidence

- Input: Navigate the main Kirie renderer to `#/settings/modules/mcp`.
- Original result: Godot reports unregistered `eventa:invoke:electron:mcp:get-runtime-status-send` and `eventa:invoke:electron:mcp:read-config-text-send` requests during page setup.
- Additional contracts: The same page can open, write, test, apply, and restart MCP configuration. The MCP tool store and desktop overlay also list and call tools. These actions did not run separately in the latest session.
- Electron source: [MCP service](../stage-tamagotchi/src/main/services/airi/mcp-servers/index.ts).
- Boundary finding: The Electron implementation owns `mcp.json`, starts child processes, and communicates with stdio MCP servers through Node.js. These capabilities do not belong in Kirie Platform.
- Current decision: Block implementation until AIRI defines a supported sidecar artifact, MCP process lifecycle, configuration ownership, shutdown, and desktop packaging.

## GAP-026 evidence

- Input: Navigate the main Kirie renderer to `#/about`.
- Original result: The About component calls `useElectronAutoUpdater()` during setup. That composable requests `window.electron.ipcRenderer` before the component mounts.
- Original error: `Electron ipcRenderer is not available. Pass it explicitly to useElectronEventaContext().`
- Impact: The whole About route fails before it can read update preferences or render the updater controls. The updater devtools route uses the same Electron-only composable.
- Electron sources: [renderer composable](../../packages/electron-vueuse/src/composables/use-electron-auto-updater.ts) and [update service](../stage-tamagotchi/src/main/services/electron/auto-updater.ts).
- Required result: The renderer must use the shared AIRI host context. AIRI must also define update state, checking, download, installation, channel preferences, packaging, and release-feed policy for the Godot application.
- Current decision: Keep the gap open until the renderer bridge and Godot update policy have an owner.

## GAP-027 evidence

- Input: Navigate the main Kirie renderer to `#/settings/system/developer`, then click **Open**, **Open Editor**, and **Markdown Stress**.
- Original result: Godot reports unregistered `windows:main:devtools:open`, `windows:editor:open`, and `windows:devtools:open` requests.
- Electron source: [application window composition](../stage-tamagotchi/src/main/index.ts).
- Required result: AIRI must either provide equivalent Kirie developer tools and native windows or remove actions that this host cannot fulfill.
- Boundary finding: These are development-only AIRI application windows. They do not justify a general Kirie Platform API without a reusable host requirement.
- Current decision: Keep the gap open while AIRI selects the supported Kirie developer-tool surface.
