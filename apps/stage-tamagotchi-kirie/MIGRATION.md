# Stage Tamagotchi Kirie migration

Status: In progress. Updated: 2026-09-29.

This document owns the migration scope, capability matrix, open failures, and acceptance evidence.
[README.md](README.md) owns setup, commands, and troubleshooting.

## Current acceptance

Windows has **23 passing items, one failing item, and five deferred items**.
No matrix item remains partially tested or untested. A pass covers only the recorded checks.

The original macOS migration accepted 24 items and deferred five.
Its broader runtime review used Kirie 0.4.2 on 2026-09-21.
Windows used Kirie 0.6.5 on 2026-09-29.
These different baselines do not establish that every Windows failure is specific to Windows.

- [Capability matrix](#capability-matrix)
- [Open Windows failures](#open-windows-failures)
- [Scope and ownership](#scope-and-ownership)
- [Deferred work](#deferred-work)
- [Implementation constraints](#implementation-constraints)
- [Dependency baseline](#dependency-baseline)
- [Acceptance evidence](#acceptance-evidence)

## Capability matrix

`Accepted` records the original macOS decision.
`Pass` records successful Windows checks.
`Pass (user review)` identifies the user's Windows acceptance.
`Fail` records a required behavior that failed.
`Deferred` identifies work outside the current milestone.

Six Windows passes include user acceptance decisions.
The user accepted native resize despite the unchanged cursor. That observation is not a tracked defect.
The review does not imply unreported coverage of multiple displays or every onboarding and login branch.

| ID | Capability | Original macOS decision | Windows | Windows evidence |
| --- | --- | --- | --- | --- |
| GAP-001 | Window leadership | Accepted | Pass | Main used explicit leader state. Settings and Chat used follower state. |
| GAP-002 | Native edge resize | Accepted | Pass (user review) | The user confirmed that native edge resize works and accepted the result. The unchanged cursor remains an observation, not a tracked defect. |
| GAP-003 | Pointer state | Accepted | Pass | Native AUV movement changed the host pointer coordinates and inside state. |
| GAP-004 | Display snapshot | Accepted | Pass (user review) | Display and bounds RPCs worked at 200% scaling. The user confirmed normal Windows behavior. No separate multi-display evidence exists. |
| GAP-005 | Window movement and pinning | Accepted | Pass (user review) | Pin and unpin changed native z-order relative to Explorer. The user confirmed normal Windows behavior. |
| GAP-006 | Window centering | Accepted | Pass | Center changed native coordinates to `(1150, 400)` for a 900 × 1200 window. |
| GAP-007 | Spotlight | Accepted | Pass | After the window flag fix, direct open and native scan-code Ctrl+Shift+A displayed Spotlight. Repeated open and hide/reopen passed. Desktop capture showed the input and transparency. Earlier notification display and click-to-Chat passed. Physical keyboard and macOS regression checks remain pending. |
| GAP-008 | Global shortcuts | Accepted | Pass | Register, list, duplicate rejection, and unregister passed. Physical Ctrl+Shift+K produced one down/up pair in the foreground and another in the background. |
| GAP-009 | Window lifecycle | Accepted | Pass | Native actions produced minimize, restore, blur, and focus events. |
| GAP-010 | Server channel | Deferred | Deferred | AIRI server configuration and lifecycle require the deferred sidecar work. |
| GAP-011 | Locale | Accepted | Pass | Locale changes reached another window and survived process restart. The Chinese locale normalized to `zh-Hans`. English also survived the next restart. |
| GAP-012 | Onboarding | Accepted | Pass (user review) | Window creation and reuse passed. The user reported that onboarding looked normal on Windows. |
| GAP-013 | Settings window | Accepted | Pass | Settings opened, routed, closed through its native title bar, and reopened. |
| GAP-014 | Chat window | Accepted | Pass | Chat closed through its native title bar and reopened. Two further open requests reused one minimal follower window. |
| GAP-015 | Application exit | Accepted | Fail | Both native close and application quit ended with a CEF access violation. |
| GAP-016 | Microphone permission state | Accepted | Pass (user review) | Permission state and reset worked. The user accepted the result and excluded the renderer exception from migration failures. See Windows microphone permission evidence. |
| GAP-017 | Microphone access policy | Accepted | Pass | Allow, deny, repeated requests, follower denial, grant persistence, and application-owned stream revocation passed. One capture after restart failed transiently. See the follow-up evidence. |
| GAP-018 | Notice window | Accepted | Pass | Confirmation returned `true`. Native title-bar close and the cancel contract each returned `false`. Each operation closed the window. |
| GAP-019 | Account sign-in | Accepted | Pass (user review) | The user confirmed Windows sign-in behavior. The automated session also displayed existing account state. Individual cancellation branches lack separate evidence. |
| GAP-020 | Window transparency | Accepted | Pass | AUV desktop captures showed desktop and Explorer pixels around the character and controls, without an opaque window rectangle. |
| GAP-021 | External links | Accepted | Pass | External URL RPC resolved. A later AUV desktop capture showed the requested GitHub page in Chrome. |
| GAP-022 | Application data directory | Accepted | Pass | Data directory RPC returned the expected Godot user directory. A later AUV capture showed that directory in Explorer. |
| GAP-023 | Plugin host | Deferred | Deferred | The Node.js plugin host and extension lifecycle require the deferred sidecar work. |
| GAP-024 | Artistry | Deferred | Deferred | Artistry configuration and generation require the deferred sidecar work. |
| GAP-025 | MCP | Deferred | Deferred | MCP configuration and stdio process management require the deferred sidecar work. |
| GAP-026 | Packaging and updates | Deferred | Deferred | Production packaging, installation, and updates remain outside this migration scope. |
| GAP-027 | Inspector and Devtools | Accepted | Pass | Native devtools requests reused one page. A desktop capture showed the connected Inspector, the main renderer DOM, and its live preview. |
| GAP-028 | Shared browser context | Accepted | Pass | Cookies, localStorage, BroadcastChannel, and Web Locks crossed windows. Persistent cookie and localStorage probes survived process restart. |
| GAP-029 | Chat initialization and send | Accepted | Pass | Initialization, two requests, and saved replies passed. The original missing-permission-handler failure did not recur. A session selection observation lacks a confirmed reproduction through normal user actions. See Windows Chat evidence. |

## Open Windows failures

### GAP-015: Application exit can crash

Native close reproduced a crash at 17:41:53.
The quit adapter reproduced it at 18:10:52 with four WebViews open, and again at 19:11:48.

The host logged `destroy_webview`. Windows Application event 1000 reported:

| Field | Value |
| --- | --- |
| Application | `Godot_v4.7.2-stable_mono_win64.exe` |
| Module | `libcef.dll_unloaded`, version `152.0.6.0` |
| Exception | `0xc0000005` |
| Offset | `0x000000000452217a` |

This evidence locates the failure near shutdown. It does not establish the owner of the invalid memory access.
See Microsoft's [access violation reference](https://learn.microsoft.com/en-us/shows/inside/c0000005).

A later exit returned code `0` and reported two leaked ObjectDB instances.
The crash does not occur on every exit. The successful attempt does not close this failure.

### Additional observations

- A child-window close logged an unhandled `AIRI host context disposed.` rejection at 18:34:04.
  The stack reached `disposeHostContext` and `disposeRendererHost`. Close and reopen succeeded, but promise cleanup requires follow-up.
- The first microphone request after one restart returned `AbortError: Failed due to shutdown`.
  An immediate repeat returned a live audio track. The cause remains unknown.
- Root lint reports 41 errors in CEF vendor JSON and generated C# output.
  This is separate from the runtime failures.

## Scope and ownership

The objective is to preserve Stage Tamagotchi behavior in a Kirie desktop host.
The Electron application remains the behavior reference and a supported target.

The current milestone excludes model rendering, model assets, model packaging, and model-specific media behavior.
This includes Live2D, VRM, and MMD.
Linux desktop notifications remain outside the review.
The [Kirie Platform documentation](https://github.com/moeru-ai/godot-kirie/blob/v0.6.4/packages/platform/README.md#desktop-notifications) lists macOS and Windows notification backends.

```text
Stage Tamagotchi Vue renderer
  -> AIRI host contracts
  -> @gd-kirie/platform and @gd-kirie/ipc-eventa
  -> Kirie IPC
  -> GdKirie.Platform and AIRI Godot handlers
  -> Godot and operating-system APIs
```

| Owner | Responsibility |
| --- | --- |
| AIRI Kirie application | Renderer integration, native application windows, authentication, permissions, and business services |
| Kirie Core | WebView lifecycle and IPC transport |
| Kirie Platform | General desktop capabilities through Godot and operating-system APIs |
| Electron application | Supported application and behavior reference |
| AIRI sidecar | Deferred Node.js services and their process lifecycle |

`apps/stage-tamagotchi-kirie/` remains the final Kirie application directory.
The renderer reference is `apps/stage-tamagotchi/src/renderer/`, with contracts under its `src/shared/`.
`engines/stage-tamagotchi-godot/` remains a separate runtime.
The production Web entry is `res://src-web/dist/index.html`.

The original phases 0 through 5 are complete: project setup, renderer adaptation, gap discovery, shared context ownership, and Platform integration.
Phase 6 remains open because Windows acceptance contains reproduced failures.

### Rules for further changes

1. Reproduce an in-scope runtime failure before adding a capability.
2. Find the Godot API, node, setting, or lifecycle that owns the behavior.
3. Keep general desktop capabilities in Kirie Platform and AIRI business services in AIRI.
4. Keep one Eventa context owner per renderer and Godot window operations on the main thread.
5. Record a proven Godot limit here before native integration or sidecar work.
6. Get explicit approval before adding native dependencies, sidecars, or dependency workarounds.
7. Preserve Electron transport paths and the Stage Tamagotchi renderer.
8. Do not add an Electron `BrowserWindow` facade or mock behavior that conceals a missing capability.
9. Keep model-related errors outside this milestone.
10. Do not create commits unless the user requests them.

## Deferred work

These features remain AIRI responsibilities. Their missing APIs do not justify new Kirie Core or Platform services.

| Gap | Observed request or behavior | Reopen condition |
| --- | --- | --- |
| GAP-010 | `server-channel:get-config` and `server-channel:get-qr-payload` | The user reopens sidecar work. AIRI defines a supported artifact and lifecycle, or accepts a user-managed external server. |
| GAP-023 | `plugins:tools:list-xsai` and its timeout abort | The user reopens sidecar work. AIRI owns plugin discovery, workers, shutdown, and packaging. |
| GAP-024 | `artistry:sync-config` | The user reopens sidecar work. AIRI owns persistence, provider lifecycle, connection tests, generation, and Widget updates. |
| GAP-025 | `mcp:get-runtime-status` and `mcp:read-config-text` | The user reopens sidecar work. AIRI owns configuration, stdio processes, shutdown, and packaging. |
| GAP-026 | Disabled About and updater controls | The user reopens production releases. AIRI defines versions, export presets, signed artifacts, manifests, installation, and relaunch. |

`@proj-airi/server-runtime` requires Node.js listener and WebSocket APIs.
The workspace Node.js command does not provide a production sidecar.
The plugin host needs Node.js files, workers, and runtime module access.
Artistry needs secure credentials, background jobs, callbacks, downloads, and Widget updates.
MCP needs configuration ownership and child-process management.

Do not port the AIRI server protocol to C# as a workaround.
Do not expose Artistry provider credentials in the renderer or depend on browser CORS for desktop provider access.

The packaging audit found no `export_presets.cfg`, Kirie release workflow, release version source, or update manifest.
The application package version was `0.0.0`.
A resource pack alone cannot update the C# assembly and native Godot CEF libraries.
See Godot's [export guide](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_projects.html#exporting-from-the-command-line)
and [resource-pack guide](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_pcks.html#opening-pck-or-zip-files-at-runtime).

Do not substitute an Electron installer or mark a downloaded artifact as installed.
Before update acceptance, exercise download, integrity validation, installation, relaunch, and channel selection with versioned Kirie artifacts.

## Implementation constraints

These constraints preserve the reasons for earlier fixes. The capability matrix owns their current acceptance status.

### Shared contexts and native windows

The main renderer receives `synced-leader=true` before Pinia initialization.
Secondary windows receive `synced-leader=false`.
Chat and Spotlight use `stage-runtime=minimal`.

Pointer, display, window-action, and lifecycle adapters borrow the shared host context.
Display placement uses one atomic current-display snapshot.
Godot owns edge detection, native resize, movement, and close requests.

Onboarding, Settings, and Chat reuse their existing window on repeated requests.
Settings also applies the latest requested route when requests arrive before its renderer is ready.
Notice requests resolve `true` on confirmation and `false` on cancellation or close.
The quit adapter preserves Electron's no-argument API and sends an explicit empty payload to Godot.

Transparency requires the CEF background, root viewport, and native window to preserve alpha.
Auxiliary transparent windows require their own settings.
See [Godot Window](https://docs.godotengine.org/en/4.7/classes/class_window.html)
and [transparency settings](https://docs.godotengine.org/en/4.7/classes/class_projectsettings.html#class-projectsettings-property-display-window-per-pixel-transparency-allowed).

### Spotlight ownership and reload

AIRI owns the native window, shortcut persistence in `user://spotlight.cfg`, and Eventa contracts.
The main renderer registers the OS shortcut through Kirie Platform, outside the renderer-owned GAP-008 registration map.
Renderer `unregisterAll` must not release Spotlight.

Spotlight reuses one borderless, always-on-top window. Close and blur hide it without destruction.
Its renderer shows result notifications. Notification activation opens Chat.
This orchestration does not require a Kirie Core API.

The original reload defect left native registration callbacks attached to an unloaded page.
CEF emitted `beforeunload`, but not `pagehide`, `unload`, or `visibilitychange`.
The fix releases the registration on `beforeunload`.
Four `Page.reload` calls and two `window.location.reload()` calls then avoided duplicate registration errors.

The macOS Forward+ review removed synthetic mouse clicks, focus scripts, and cross-frame focus retries.
`cef.FocusMode` and `cef.GrabFocus()` remained necessary.
The user confirmed no extra Dock or Mission Control entry.
These macOS observations do not establish Windows Spotlight behavior.

### Microphone permissions and the original Chat stall

AIRI stores `not-determined`, `granted`, or `denied` in `user://permissions.cfg`.
Browser permission state can remain `prompt`; AIRI host state is authoritative.
The exact origin of the main renderer is the only permitted audio requester.
Other permission types, origins, and windows receive denial.

Godot CEF uses the `Signal` permission policy.
The host coalesces native request IDs behind one opaque renderer prompt ID.
Denial, modal close, a two-minute timeout, and host shutdown deny pending requests.
See the pinned [permission settings](https://github.com/dsh0416/godot-cef/blob/v1.16.1/crates/gdcef/src/settings.rs)
and [grant/deny methods](https://github.com/dsh0416/godot-cef/blob/v1.16.1/docs/api/methods.md#permission-handling).

Every window that awaits microphone state must register its AIRI handlers.
Originally, Chat awaited an unhandled permission request before `chatStore.initialize()`.
Its `activeSessionId` remained empty, and send failed with `Failed to load the target chat session`.

`MicrophonePermissionService.Attach` now binds the required contexts, including Chat, onboarding, notice, and developer windows.
Only the main renderer owns prompts.
The microphone enable button resets a denied AIRI permission before the next request.
This retry requires an explicit button click. Automatic requests retain the stored denial.
An unhandled application invoke is a host integration error.
The proposed upstream default rejection in [godot-kirie#87](https://github.com/moeru-ai/godot-kirie/pull/87) closed without merge.
The AIRI handler attachment is the accepted fix.

### Authentication and external navigation

AIRI owns OIDC sign-in independently of the server sidecar.
It uses a system browser, PKCE, state validation, and a temporary `127.0.0.1` callback listener.
The renderer supplies the server URL and client ID before login.
Logout cancels an unfinished attempt.
Tests cover forged-state rejection without listener consumption and callback CORS.
See [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html).

External HTTP and HTTPS links use Kirie Platform `openExternalUrl()`.
AIRI filters other schemes, and Platform validates the absolute URL before `OS.shell_open()`.
Shutdown and hot reload restore `window.open` and remove the click handler.
A live `file:` request failed at the host boundary.

The data-directory API accepts no caller path.
Godot selects `OS.get_user_data_dir()`, opens it, and propagates operating-system errors.
The application name `AIRI` selects its own data directory.

### Inspector, routes, and browser state

AIRI selects the leader target from `/json/list` and opens its `devtoolsFrontendUrl`.
The bare debug-port page previously returned an empty body.
Godot CEF allows the remote Inspector origin `https://chrome-devtools-frontend.appspot.com`.
Production builds keep remote debugging disabled.
See the pinned [CEF properties](https://github.com/dsh0416/godot-cef/blob/v1.16.1/docs/api/properties.md)
and [security baseline](https://github.com/dsh0416/godot-cef/blob/v1.16.1/docs/api/security-baseline.md).

Standalone Devtools windows reuse validated routes and optional geometry.
The empty Electron Editor shell remains excluded.
A route-keyed error boundary isolates failures and permits later navigation.

Official Godot CEF 1.16.0 introduced the shared request-context behavior that closed GAP-028.
The tracked [1.16.1 release](https://github.com/dsh0416/godot-cef/releases/tag/v1.16.1) preserves that context and AIRI scheme handlers.
Cookies, storage, BroadcastChannel, and Web Locks must cross application windows.
The leader holds `tab-airi:stage:pinia`; a follower's request remains pending.

## Dependency baseline

The coordinated Kirie baseline is 0.6.5 for npm, NuGet, and the Godot addon.
Godot and `Godot.NET.Sdk` use 4.7.2. Godot CEF uses 1.16.1.
The [Kirie 0.6.5 release](https://github.com/moeru-ai/godot-kirie/releases/tag/v0.6.5) supplies the official artifacts.

The addon archive SHA-256 is
`d07aeaadac2184f39f1cae8a72a26320ee6d21d4000afc5d575db76f2fb9ba7f`.
`addons/kirie/godot_cef.json` supplies the CEF version and published digest.
The macOS artifact passed strict signature verification.
Windows used D3D12 Forward+ with accelerated OSR.

On 2026-09-29, the NuGet v3 feed omitted both 0.6.5 packages and restore failed with `NU1102`.
The official v2 feed supplied them. That session used this command:

```sh
mise x -- dotnet restore tests/StageTamagotchiKirie.Tests/StageTamagotchiKirie.Tests.csproj --source https://www.nuget.org/api/v2/ --no-http-cache
```

The repository retained its default NuGet source.
Kirie 0.6.5 corrected Windows CEF installation through system `tar.exe` and rename retries.
See the [0.6.4 to 0.6.5 changes](https://github.com/moeru-ai/godot-kirie/compare/v0.6.4...v0.6.5).

The workspace has exact Kirie entries under `minimumReleaseAgeExclude`.
Later versions remain subject to the standard release-age policy.
See [pnpm dependency resolution](https://pnpm.io/settings/dependency-resolution).

Use published packages for acceptance. Do not restore committed `link:` dependencies or `ProjectReference` entries.
Do not copy Kirie implementations or contracts into AIRI.
A reproduced API gap can justify temporary sibling-source work after the required dependency-boundary approval.
Return to one coordinated published version before acceptance.

## Acceptance evidence

### Ablation 4: Spotlight visibility state (2026-09-30)

The experiment removed `_userVisible` and its two assignments from [SpotlightWindow](src-godot/scripts/SpotlightWindow.cs).
Both focus guards now read the inherited `Window.Visible` property.
The source change removes three lines overall and adds no replacement abstraction.

The scene starts hidden. Its show and hide methods were the only writers of the removed field.
Godot updates its visibility value before native window operations and visibility callbacks.
See the [Godot 4.7.2 implementation](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/window.cpp#L892-L1029).
Thus, the focus guards retain the same visibility check without a second state value.
`_showRequested` remains separate because it records a request before the WebView is ready.
Readiness, the two-frame focus grace period, deferred focus checks, CEF input focus, and transparency operations remain unchanged.

The baseline and changed builds ran on macOS with Godot 4.7.2, Kirie 0.6.5, and Metal Forward+.
Both builds accepted native keyboard input and passed repeated open, Escape hide, repeated hide, and hide followed by reopen.
Opening Settings in normal window mode hid Spotlight after focus loss. Reopening Spotlight restored its focus.
Each build retained one Spotlight CEF target throughout these operations.
The changed build also accepted native input on its first open.

During the baseline run, Settings entered native fullscreen mode for an unconfirmed reason.
That interval was excluded from focus evidence. The window returned to normal mode before the focus checks were repeated.
Settings stayed in normal window mode during the changed run.
These checks do not establish native close-request handling, global-shortcut delivery, or Windows acceptance.

Both application quit requests returned process code 0 with Spotlight and Settings open.
Both runs reported three leaked ObjectDB instances and the existing unregistered requests for deferred migration capabilities.

| Command | Result |
| --- | --- |
| `mise x -- dotnet build --no-restore` | Passed before and after the change, with no warnings or errors. |
| `mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests --no-restore` | Passed. |
| `mise x -- dotnet format StageTamagotchiKirie.csproj --verify-no-changes --no-restore` | Passed. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed, 13 files and 42 tests. |
| `mise x -- pnpm lint` | Failed with the same 1,715 errors and 701 warnings as ablation 3. |
| `mise x -- pnpm exec moeru-lint apps/stage-tamagotchi-kirie/MIGRATION.md` | Passed. |
| `git diff --check` | Passed. |

This experiment retains `Window.Visible` as the visibility source and does not change the capability matrix.

### Ablation 3: Devtools registration ownership (2026-09-29)

The experiment removed the registration set, disposal loop, and reverse `Detach` callback from [DeveloperToolsService](src-godot/scripts/developer-tools-service.cs).
It also removed the reverse owner field from `Binding`.
The source change removes 16 lines overall and adds no replacement abstraction.
`Binding` still owns both handler registrations and retains its disposal guard and release order.

[Main](src-godot/scripts/Main.cs) releases its registration before the service.
[SettingsWindow](src-godot/scripts/SettingsWindow.cs) releases its registration before its Eventa context.
Settings is a child of Main. Godot calls the parent's `_ExitTree` after its children leave the tree.
See the [Godot lifecycle contract](https://docs.godotengine.org/en/stable/classes/class_node.html#class-node-private-method-exit-tree).
These are the only attachment sites, so the removed set was empty at normal service disposal.
Inspector cancellation, HTTP disposal, and developer-window ownership remain unchanged.

The baseline and changed builds ran on macOS with Godot 4.7.2, Kirie 0.6.5, and Metal Forward+.
Both builds passed repeated Devtools requests from Main and Settings, Settings close and reopen, and Devtools close and recreation.
Two requests with the same key reused one window, including after recreation.
Baseline Inspector requests passed from Main and Settings.
After the change, an Inspector request from the recreated Settings window opened the main renderer's target.
The changed build did not repeat the Inspector request from Main.

Both completed shutdown checks returned code 0 with Settings and Devtools open.
The baseline used the application quit adapter. The changed build used the native application menu.
Both reported five leaked ObjectDB instances and the existing GAP-010 requests for the deferred server channel.
Interrupted CDP runs were excluded from shutdown evidence. These checks do not establish Windows acceptance.

| Command | Result |
| --- | --- |
| `mise x -- dotnet build --no-restore` | Passed before and after the change, with no warnings or errors. |
| `mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests --no-restore` | Passed. |
| `mise x -- dotnet format StageTamagotchiKirie.csproj --verify-no-changes --no-restore` | Passed. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed, 13 files and 42 tests. |
| `mise x -- pnpm lint` | Failed with the same 1,715 errors and 701 warnings as ablation 2. |
| `mise x -- pnpm exec moeru-lint apps/stage-tamagotchi-kirie/MIGRATION.md` | Passed. |
| `git diff --check` | Passed. |

This experiment retains caller-owned registrations and does not change the capability matrix.

### Ablation 2: Chat registration ownership (2026-09-29)

The experiment removed `ChatWindowManager.OpenBinding`, its registration set, and the reverse `Detach` callback.
[ChatWindowManager](src-godot/scripts/ChatWindowManager.cs) now retains its main registration and returns Eventa registrations directly from `Attach`.
The source change removes 35 lines overall.

[SpotlightWindow](src-godot/scripts/SpotlightWindow.cs) already owns its Chat registration and disposes it before its Eventa context.
Spotlight is a child of Main. Godot runs a parent's `_ExitTree` after its children leave the tree.
See the [Godot lifecycle contract](https://docs.godotengine.org/en/stable/classes/class_node.html#class-node-private-method-exit-tree).
Thus, Spotlight releases its registration before Main disposes the Chat manager.
The removed registration set added no cleanup to this ownership sequence.

The baseline and changed builds ran on macOS with Godot 4.7.2, Kirie 0.6.5, and Metal Forward+.
Both builds passed main-window open, repeated open, native title-bar close, and reopen from the hidden Spotlight renderer.
After the change, two Spotlight requests reused one replacement Chat page.
That page completed initialization, displayed its input controls, and had no route error.
Both application exits returned code 0 and reported the same four leaked ObjectDB instances.
These checks do not establish notification delivery or Windows acceptance.

Initial `--no-restore` checks failed with `NU1605` because local generated assets selected GodotSharp 4.7.1.
The normal build and test commands restored the pinned 4.7.2 dependencies without configuration changes.

| Command | Result |
| --- | --- |
| `mise x -- dotnet build` | Passed after restoring the project assets. |
| `mise x -- dotnet build --no-restore` | Passed after the change and after format verification, with no warnings or errors. |
| `mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests` | Passed after restoring the test assets. |
| `mise x -- dotnet format StageTamagotchiKirie.csproj --verify-no-changes --no-restore` | Passed without workspace warnings. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed, 13 files and 42 tests. |
| `mise x -- pnpm lint` | Failed with the same 1,715 errors and 701 warnings as ablation 1. |
| `mise x -- pnpm exec moeru-lint apps/stage-tamagotchi-kirie/MIGRATION.md` | Passed. |
| `git diff --check` | Passed. |

This experiment retains direct registration ownership and does not change the capability matrix.

### Ablation 1: Spotlight CEF lookup (2026-09-29)

The experiment removed `SpotlightWindow.FindCefControl` and its search through arbitrary child controls.
The final fallback returned `KirieNode`, which cannot forward focus to the CEF document.

The pinned [Kirie backend](addons/kirie/gd_kirie.gd) names the control `KirieCefWebView` and adds it before `WebViewReady`.
The [Kirie node](addons/kirie/kirie_node.gd) supplies itself as the parent.
[SpotlightWindow](src-godot/scripts/SpotlightWindow.cs) now reads `KirieNode/KirieCefWebView` directly after readiness.
It retains `FocusMode` and `GrabFocus`. The source change removes 36 lines overall.

The macOS experiment used Godot 4.7.2, Kirie 0.6.5, and Metal Forward+.
The baseline and changed builds both focused the input on first open and received native text input without a click.
After the change, Escape hid Spotlight. Reopening restored focus and accepted the native input `test`.
Opening Settings moved focus away and changed Spotlight's native state to `visible=false` and `focused=false`.
Two further open requests reused the same CEF page and restored both document and native focus.

Open requests used the existing Eventa contract. This experiment does not establish global-shortcut or Windows acceptance.
The direct lookup depends on the pinned addon node name. An addon upgrade requires another check of that name and readiness order.

| Command | Result |
| --- | --- |
| `mise x -- dotnet build --no-restore` | Passed before and after the change, with no warnings or errors. |
| `mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests --no-restore` | Passed. |
| `mise x -- dotnet format --verify-no-changes --no-restore` | Exited 0. The comment-only rerun reported a workspace load warning. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed, 13 files and 42 tests. |
| `mise x -- pnpm lint` | Failed with 1,715 errors and 701 warnings. All errors were in 23 Git-ignored artifact files. |
| `git diff --check` | Passed. |

The lint errors came from native addon artifacts, previous `.auv` captures, and generated C# output.
This experiment retains the simpler lookup and does not change the capability matrix.

### Windows environment and checks

The application commit was `fdc9161c8` on `doji/migrate-to-kirie`.
The native session used Godot 4.7.2 Mono, Kirie 0.6.5, and Godot CEF 1.16.1.
The machine had an NVIDIA RTX 4060 Laptop GPU and one 3200 × 2000 display at 200% scaling.

| Check | Result |
| --- | --- |
| Desktop prerequisites | Passed. The absent Android SDK was outside scope. |
| Application typecheck | Passed. |
| Vitest | 13 files and 42 tests passed. |
| C# contract tests | Passed. |
| Web and C# build | Passed with no C# warnings or errors. |
| Root typecheck | 53 tasks passed, including 52 cached tasks. |
| Root lint | 41 errors in CEF vendor JSON and generated C# output. |
| Documentation diff | `git diff --check` passed. |

Repeated root checks returned the same results.
The [README commands](README.md#checks-and-build) provide the normal verification sequence.

The Windows route check covered these 12 paths:

```text
/settings
/settings/account
/settings/data
/settings/connection
/settings/system
/settings/system/general
/settings/system/permissions
/settings/system/window-shortcuts
/settings/system/developer
/devtools/global-shortcut
/devtools/use-electron-all-displays
/devtools/use-window-mouse
```

The route check displayed the expected headings without a route error boundary.
It did not repeat the complete historical macOS route audit.

Native screenshots established transparency, pin/unpin z-order, notifications, external URL access, and application directory access.
Settings and Chat closed through their title bars and reopened.
The Inspector screenshot showed the real DOM and live preview.

Chinese locale selection normalized from `zh-CN` to `zh-Hans` and survived restart.
The restored English locale survived the next restart.
A new Chat window read the same locale, permission, and localStorage values.
A persistent cookie was present in Main and Chat before shutdown and remained present in the next process.

The user confirmed displays, movement, onboarding, sign-in, and resize.
The physical Ctrl+Shift+K test recorded two complete down/up pairs.
The session then removed its temporary registration and observer.

### Windows microphone permission evidence

Permission state, reset, and grant persistence passed.
The original acceptance run stopped the application-owned audio track from `live` to `ended` and left audio input disabled.

A later interface check granted microphone access, opened Chat, and revoked access through Settings > Permission Management.
The permission state changed to `not-determined`, and Settings displayed `Not set`.
Chat logged ``Must be called at the top of a `setup` function`` through `useI18n`, `useAnalytics`, and the audio device store.
The check did not establish a failure of permission revocation or Chat use.

The user accepted GAP-016 and excluded this exception from migration failures.
This record retains the observation without a repair requirement. No application code changed for this decision.

### Windows Chat evidence

The original GAP-029 failure blocked Chat initialization because its window context lacked microphone-permission handlers.
The macOS fix attached `MicrophonePermissionService` to the affected window contexts.
The current Windows branch includes that fix, and the initialization failure did not recur.

The Windows test used the Chat UI and a temporary loopback OpenAI-compatible provider with a deterministic SSE reply.
Initialization and two requests completed. Both user messages and replies remained in the test conversation.
These results support a pass for the original initialization and send requirement.

The same test recorded a switch to the original conversation after a send.
The saved reply appeared again after selection of the test conversation.
The records do not establish a reproduction through normal session creation and selection in the interface.
They do not rule out effects from the test setup. The source audit did not establish a cause.

This unconfirmed observation does not establish a Windows migration failure or a recurrence of the original GAP-029 defect.
The macOS records contain no confirmed report or fix for this selection behavior.
A separate defect requires a reproducible sequence of normal user actions and evidence that excludes test setup effects.

### Windows Spotlight correction

The first Windows review failed GAP-007: physical Ctrl+Shift+A did not display Spotlight.
Direct open created its CEF target, but desktop captures showed no native window.
The host still reported `visible: true` and `focused: true`.

A later native probe reproduced the failure before the source change.
The Spotlight HWND existed, but `IsWindowVisible` returned `false` and its style was `0x860B0000`.
After the fix, the style was `0x960B0000` and `IsWindowVisible` returned `true`.
The difference is `WS_VISIBLE`.

Spotlight set its native borderless, topmost, and resize flags again after `Show()`.
Godot 4.7.2 rewrites Windows styles for these operations.
The topmost and resize paths omit `WS_VISIBLE` for a borderless subwindow.
The repeated `Unfocusable = false` assignment can cause the same failure on an already visible window.
Godot's internal visibility state stays `true`, so another `Show()` does not restore native visibility.
See the [Windows display implementation](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/windows/display_server_windows.cpp)
and [Window visibility implementation](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/window.cpp).

The fix removes those four repeated assignments. The scene retains the window flags and the default permits focus.
The existing transparency sequence, native focus, and CEF focus remain in place.
No Kirie or Godot dependency changed.

Direct open, repeated open, and hide/reopen passed after the C# rebuild.
Windows `SendInput` supplied Ctrl+Shift+A with scan codes, and the registered shortcut displayed Spotlight.
The CEF document reported focus on its input.
A native desktop capture showed the input and transparent surroundings at `(880, 419, 1440, 200)`.
This automated check does not replace a physical keyboard check. The user owns the macOS regression check.

C# build, C# contract tests, `dotnet format --verify-no-changes --no-restore`, and root typecheck passed.
Root lint retained the same 41 artifact errors.
Local probe scripts and the native capture remain under the temporary directory in `airi-gap007/`.

### Historical macOS evidence

| Date and baseline | Retained evidence |
| --- | --- |
| 2026-09-17, Kirie 0.3.0 and Godot 4.7.1 | Initial host adapters, window contracts, permission decisions, external navigation, and authentication review. |
| 2026-09-18 | All 117 static routes and representative values for three parameterized routes rendered in real CEF. Connected Inspector and account state passed. |
| 2026-09-19, official CEF 1.16.0 | Cookie, localStorage, BroadcastChannel, and Web Lock probes crossed WebViews. |
| 2026-09-20, Kirie 0.4.1 and CEF 1.16.1 | Native close/reopen, external links, data-directory access, notice confirmation, shared context, and the repaired Chat send passed. |
| 2026-09-21, Kirie 0.4.2 and Godot 4.7.2 | Metal Forward+ enabled accelerated OSR. Shared-context checks repeated. User review accepted Spotlight and notification behavior. |
| 2026-09-24, Kirie 0.6.2 | Main-window startup and dependency/build checks passed. |
| 2026-09-29, Kirie 0.6.5 dependency check | 36 Node tests and six browser tests passed. Earlier lint reported 32 artifact-format errors before the Windows run reported 41. |

The earlier OpenGL compatibility renderer used software rendering.
Forward+ removed the need for the old Spotlight focus workarounds.

Widget flows, desktop-overlay startup, and the inlay window remain outside recorded runtime coverage.
The inlay route still contains Electron-specific references, and Kirie does not create that application window.
An untested surface becomes a gap only after an in-scope failure reproduces.
`godot-stage:get-status` remains outside the model-free milestone.

### AUV test method and limits

The session installed unmodified AUV 0.0.22 from commit `2957b9ff`, replacing 0.0.20.
The first Cargo checkout represented a proto symlink as a text file and lacked `health.proto`.
A fresh clone with `core.symlinks=true` and a locked build succeeded without a dependency patch.
See [Git's symlink setting](https://git-scm.com/docs/git-config#Documentation/git-config.txt-coresymlinks).

The direct CLI path rejected Windows operations that succeeded through the daemon and an explicit Device.
The successful probe used:

```powershell
mise x -- auv serve
mise x -- auv devices list --json
mise x -- auv --device-id <local-device-id> invoke window.list --json --no-overlay
mise x -- auv --device-id <local-device-id> invoke display.list --json --no-overlay
mise x -- auv --device-id <local-device-id> invoke display.capture --json --no-overlay
```

See the upstream [Windows Runner guide](https://github.com/moeru-ai/auv/blob/2957b9ff/docs/ai/references/session-api/2026-08-16-windows-local-runner-ipc-handoff.md).
At 200% scaling, captures and window bounds used physical pixels. Mouse input accepted logical coordinates.
Input `(1111, 700)` placed the pointer near physical `(2223, 1401)`.

`input.key` rejected Windows. `input.holdKeys` reached CEF, but the synthetic combinations produced no Kirie shortcut callbacks.
AUV sets `KEYBDINPUT.wScan` to zero, while Kirie matches low-level scan codes.
That is a hypothesis for the synthetic-input failure, not a proven cause.
Physical Ctrl+Shift+K passed, so the automation result alone cannot reject global shortcuts.

Sources: [AUV input](https://github.com/moeru-ai/auv/blob/2957b9ff/crates/auv-driver-windows/src/input.rs),
[Kirie shortcut runtime](https://github.com/moeru-ai/godot-kirie/blob/v0.6.5/packages/GdKirie.Platform/src/GlobalShortcuts/WindowsGlobalShortcutRuntime.cs),
and [Windows shortcut decision](https://github.com/moeru-ai/godot-kirie/blob/v0.6.5/docs/decisions/0003-use-a-low-level-keyboard-hook-for-windows-global-shortcuts.md).

### Local evidence and cleanup

Native images remain under the local temporary directory in `airi-auv-windows-probe/artifacts/`.
These run IDs identify the retained captures:

| Observation | Run ID |
| --- | --- |
| Main transparency | `e5504b71-d7fa-358e-ca33-fa2bffb327e4` |
| Unpinned below Explorer | `8ff16637-69bc-ad8f-42d9-40f34b0ac8c6` |
| Pinned above Explorer | `e3e0db76-81ba-7b79-aa08-a409bcc1afcf` |
| Windows notification | `d93938bb-0e18-1328-b03d-631ace6e617b` |
| Chat after notification click | `94cb6936-c17a-2426-585a-6f07a9c08d6c` |
| Desktop after Spotlight open | `7bc8acd1-8697-796c-51df-aaf920ca1b04` |
| Desktop after Spotlight state read | `b00e7676-3495-fbac-f4c7-5c164b525ec1` |
| Connected Inspector | `36d18433-2ac1-0c3a-6495-351fc1b7a6ba` |
| Notice window | `71d5ef3f-2d36-a232-9698-edfd96d92856` |

The temporary directory also contains `airi-kirie-windows-*.log`, `airi-kirie-windows-native-observations.json`,
`airi-windows-acceptance-provider.log`, `airi-auv-install-symlinks.log`, and `airi-auv-acceptance-records-20260929/`.
These local artifacts are not repository fixtures.

The session removed temporary providers, conversations, cookies, storage probes, and shortcut registrations.
It stopped the loopback provider and all temporary audio tracks.
Each run restored its initial settings.
The final persistence run restored English, granted microphone permission, and disabled audio input.
The original acceptance session changed no application source or dependency files.
The later GAP-007 correction changes `SpotlightWindow.cs`.

## Completion requirements

The milestone requires all of these conditions:

- Every in-scope capability passes its required platform flow, or has an explicit blocked or deferred decision.
- Published Kirie packages and the installed CEF artifact match the selected baseline and required platform signature checks.
- TypeScript and C# contracts agree, errors propagate, and Godot window work stays on the main thread.
- The complete desktop flow passes on each platform under acceptance.
- Deferred items retain explicit ownership and reopen conditions.

For each new failure, record the input, actual result, expected result, and owner here.
Add a focused reproduction, run the relevant [README checks](README.md#checks-and-build), and exercise the real desktop flow.
Complete an independent review and resolve blocking findings before acceptance.
For an IPC change, include a real request/response check.
