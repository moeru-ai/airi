# Stage Tamagotchi Kirie migration

Status: In progress. Updated: 2026-09-30.

This document owns migration scope, platform acceptance decisions, open failures, dependency baseline, and completion requirements.
[README.md](README.md) owns setup, commands, and troubleshooting.

## Current acceptance

Windows has **23 passing items, one failing item, and five deferred items**.
No matrix item remains partially tested or untested. A pass covers only the recorded checks.

The original macOS migration accepted 24 items and deferred five.
Its broader runtime review used Kirie 0.4.2 on 2026-09-21.
Windows used Kirie 0.6.5 on 2026-09-29.
These different baselines do not establish that every Windows failure is specific to Windows.
The later ablation checks do not extend the platform acceptance matrix.

- [Capability matrix](#capability-matrix)
- [Open Windows failures](#open-windows-failures)
- [Remaining acceptance work](#remaining-acceptance-work)
- [Scope and ownership](#scope-and-ownership)
- [Deferred work](#deferred-work)
- [Host architecture and implementation constraints](docs/host-architecture.md)
- [Dependency baseline](#dependency-baseline)
- [Acceptance evidence](#acceptance-evidence)

## Capability matrix

`Accepted` records the original macOS decision.
`Pass` records successful Windows checks.
`Pass (user review)` identifies the user's Windows acceptance.
`Fail` records a required behavior that failed.
`Deferred` identifies work outside the current milestone.

Six Windows passes include user acceptance decisions.
The user accepted native resize despite the unchanged cursor during the Windows review.
On 2026-09-30, the user requested resize cursor indicators. See [resize cursor indicators](docs/ablation-review.md#resize-cursor-indicators-2026-09-30).
The review does not imply unreported coverage of multiple displays or every onboarding and login branch.

| ID | Capability | Original macOS decision | Windows | Windows evidence |
| --- | --- | --- | --- | --- |
| GAP-001 | Window leadership | Accepted | Pass | Main used explicit leader state. Settings and Chat used follower state. |
| GAP-002 | Native edge resize | Accepted | Pass (user review) | The user confirmed that native edge resize works. The later cursor indicator change has separate [macOS evidence](docs/ablation-review.md#resize-cursor-indicators-2026-09-30). |
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
| GAP-016 | Microphone permission state | Accepted | Pass (user review) | Permission state and reset worked. The user accepted the result and excluded the renderer exception from migration failures. See [Windows microphone permission evidence](docs/verification.md#windows-microphone-permission-evidence). |
| GAP-017 | Microphone access policy | Accepted | Pass | Allow, deny, repeated requests, follower denial, grant persistence, and application-owned stream revocation passed. One capture after restart failed transiently. See [Windows microphone permission evidence](docs/verification.md#windows-microphone-permission-evidence) and [additional observations](#additional-observations). |
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
| GAP-029 | Chat initialization and send | Accepted | Pass | Initialization, two requests, and saved replies passed. The original missing-permission-handler failure did not recur. A session selection observation lacks a confirmed reproduction through normal user actions. See [Windows Chat evidence](docs/verification.md#windows-chat-evidence). |

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
- Historical root lint failures differ by checkout artifacts. Windows recorded 41 errors, and the later macOS review recorded 1,715 errors and 701 warnings.
  See the [platform record](docs/verification.md) and [ablation checks](docs/ablation-review.md). These results are separate from runtime failures.

## Remaining acceptance work

| Item | Required follow-up |
| --- | --- |
| GAP-015 | Reproduce and resolve the Windows CEF shutdown crash, then repeat native close and application quit. |
| GAP-002 | Review the new resize cursor indicators on Windows. The original resize acceptance remains recorded separately. |
| GAP-007 | Repeat the physical Windows Spotlight shortcut check and the macOS regression check for the Windows visibility correction. |
| Lifecycle observations | Investigate disposed-context rejections and reported ObjectDB leaks. Successful process exit does not resolve these observations. |
| Platform coverage | Repeat relevant native flows after later source changes. The macOS ablation checks do not establish Windows acceptance. |

The [ablation review](docs/ablation-review.md) records further limits for multiple displays, mixed DPI, authentication, and shortcut checks.
The five deferred capabilities retain their [reopen conditions](#deferred-work).

## Scope and ownership

The objective is to preserve Stage Tamagotchi behavior in a Kirie desktop host.
The Electron application remains the behavior reference and a supported target.

The current milestone excludes model rendering, model assets, model packaging, and model-specific media behavior.
This includes Live2D, VRM, and MMD.
Linux desktop notifications remain outside the review.
The [Kirie Platform documentation](https://github.com/moeru-ai/godot-kirie/blob/v0.6.5/packages/platform/README.md#desktop-notifications) lists macOS and Windows notification backends.

The [host architecture](docs/host-architecture.md) defines runtime ownership, source locations, and implementation constraints.

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
| GAP-023 | `plugins:tools:list-xsai` and its timeout abort, plus [unsupported directory import](#plugin-directory-import) | The user reopens sidecar work. AIRI owns plugin discovery, workers, shutdown, and packaging. |
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

### Plugin directory import

The shared [plugin inspector bridge](../../packages/stage-ui/src/stores/devtools/plugin-host-debug.ts) requires three directory import methods.
`prepareDirectoryImport` returns a plan for user review.
`commitDirectoryImport` imports the selected plan, and `cancelDirectoryImport` discards it.

Kirie's [renderer bridge](src-web/src/renderer/App.vue) rejects all three methods with `Extension directory import is not available in the Kirie host.`
These handlers satisfy the shared interface but leave GAP-023 deferred.
They create no import plan and write no plugin files.

The shared [plugin management page](../../packages/stage-pages/src/pages/devtools/plugin-host.vue) still displays the import button.
Kirie does not hide or disable it based on host capability.
An import request fails immediately, and the page displays the error.
Full support requires the deferred plugin host and its directory operations.

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

Use published packages for acceptance.
Do not commit Kirie source links through `link:` dependencies or `ProjectReference` entries.
Do not copy Kirie implementations or contracts into AIRI.
A reproduced API gap can justify temporary sibling-source work after the required dependency-boundary approval.
Return to one coordinated published version before acceptance.

## Acceptance evidence

| Record | Contents |
| --- | --- |
| [Platform verification](docs/verification.md) | Main integration checks, Windows acceptance, historical macOS results, AUV limits, and local artifact references |
| [Ablation review](docs/ablation-review.md) | Numbered experiments, the withdrawn pointer experiment, resize cursor checks, and coverage limits |

These records retain their original dates and results. This documentation reorganization adds no runtime acceptance.

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
