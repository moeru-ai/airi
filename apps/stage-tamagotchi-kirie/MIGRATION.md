# Stage Tamagotchi Kirie migration

Status: In progress. Updated: 2026-09-30.

This document owns capability decisions, blockers, deferred work, and dependencies.
[README](README.md) owns commands. [Architecture](docs/host-architecture.md) owns runtime requirements.
[Ablation review](docs/ablation-review.md) analyzes the whole migrated framework.

## Current acceptance

Windows records **23 passing items, one failing item, and five deferred items**.
The original macOS review accepted 24 items and deferred five.
No matrix item remains partially tested or untested. Each pass covers only its recorded flow.

The original macOS runtime review used Kirie 0.4.2 on 2026-09-21.
Windows used Kirie 0.6.5 on 2026-09-29.
Different baselines do not establish that every Windows failure is platform-specific.
Later simplifications do not extend either platform decision.
The single-host adapter and deferred-bootstrap changes require their own checks after implementation.

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
Application quit reproduced it at 18:10:52 with four WebViews, and again at 19:11:48.
The host logged `destroy_webview`. Windows Application event 1000 reported:

| Field | Value |
| --- | --- |
| Application | `Godot_v4.7.2-stable_mono_win64.exe` |
| Module | `libcef.dll_unloaded`, version `152.0.6.0` |
| Exception | `0xc0000005` |
| Offset | `0x000000000452217a` |

The failure occurs near shutdown. The evidence does not identify the owner of the invalid memory access.
See Microsoft's [access violation reference](https://learn.microsoft.com/en-us/shows/inside/c0000005).
A later exit returned code 0 with two ObjectDB leaks. This intermittent success does not close GAP-015.

### Additional observations

- Child close logged `AIRI host context disposed.` at 18:34:04 through `disposeHostContext` and `disposeRendererHost`.
  Close and reopen succeeded. Promise cleanup remains unresolved.
- One microphone request after restart returned `AbortError: Failed due to shutdown`. An immediate repeat returned a live track.
- Root lint failures differed by checkout artifacts: Windows recorded 41 errors. The later macOS review recorded 1,715 errors and 701 warnings.

## Remaining acceptance work

| Item | Required follow-up |
| --- | --- |
| GAP-015 | Resolve CEF shutdown, then repeat native close and application quit on Windows. |
| GAP-002 | Review the new resize cursor indicators on Windows. Original resize acceptance remains separate. |
| GAP-007 | Repeat the physical Windows shortcut and macOS regression checks for the visibility correction. |
| Lifecycle | Investigate disposed-context rejections and ObjectDB leaks. Exit code 0 does not resolve them. |
| Later source changes | Repeat relevant native flows. Historical passes do not cover the current simplifications. |
| Coverage | Preserve the [limits](docs/ablation-review.md#coverage-and-blockers) for physical input, multiple displays, mixed DPI, and authentication. |

## Scope and change rules

The objective is to preserve Stage Tamagotchi behavior in a Kirie desktop host.
Electron remains supported and supplies the behavior reference.
The original setup, renderer adaptation, gap discovery, context ownership, and Platform integration phases are complete.
Platform acceptance remains open.

The milestone excludes model rendering, assets, packaging, and model-specific media for Live2D, VRM, and MMD.
Linux notifications remain outside the review.
[Kirie Platform](https://github.com/moeru-ai/godot-kirie/blob/v0.7.0/packages/platform/README.md#desktop-notifications) lists macOS and Windows notification backends.

1. Reproduce an in-scope failure before adding a capability.
2. Use the Godot API or lifecycle that owns the behavior.
3. Keep general desktop capabilities in Platform and AIRI services in AIRI.
4. Keep one Eventa context per renderer and Godot window operations on the main thread.
5. Record a proven Godot limit before native integration or sidecar work.
6. Get explicit approval for native dependencies, sidecars, and dependency workarounds.
7. Preserve the original Electron application and separate Godot runtime.
8. Do not add a `BrowserWindow` facade or mock a missing capability.
9. Keep model errors outside this milestone.
10. Do not create commits unless the user requests them.

## Deferred work

| Gap | Missing behavior | Reopen condition |
| --- | --- | --- |
| GAP-010 | Server configuration, QR payload, listener, and WebSocket lifecycle | The user reopens sidecar work. AIRI defines an artifact and lifecycle, or accepts an external server. |
| GAP-023 | Plugin discovery, workers, directory import, and extension lifecycle | The user reopens sidecar work. AIRI owns files, runtime modules, shutdown, and packaging. |
| GAP-024 | Artistry configuration and generation | The user reopens sidecar work. AIRI owns credentials, persistence, providers, jobs, downloads, and Widget updates. |
| GAP-025 | MCP configuration and stdio processes | The user reopens sidecar work. AIRI owns configuration, process shutdown, and packaging. |
| GAP-026 | Production installation and updates | The user reopens releases. AIRI defines versions, exports, signatures, manifests, installation, and relaunch. |

The workspace Node.js command is not a production sidecar.
Do not port the server protocol to C# as a workaround.
Do not expose Artistry credentials in the renderer or depend on browser CORS for desktop provider access.

### Deferred startup reference

The Kirie bootstrap no longer connects these deferred services. Their stores, contracts, and Electron implementations remain as migration references.
Removing startup calls does not remove indirect store creation or every page entry.
The [original Kirie App.vue](https://github.com/BeanDz/airi/blob/ef7eb50e5a76265f2675e9072a7430d2dc46f09c/apps/stage-tamagotchi-kirie/src-web/src/renderer/App.vue#L136-L361) preserves the removed startup order and subscriptions.

| Gap | Retained implementation | Removed startup connection |
| --- | --- | --- |
| GAP-010 | [Channel settings](src-web/src/renderer/stores/settings/server-channel.ts), [channel store](../../packages/stage-ui/src/stores/mods/api/channel-server.ts), and [Electron service](../stage-tamagotchi/src/main/services/airi/channel-server/index.ts) | Fetch host configuration, apply it, and initialize the channel. |
| GAP-010 | [Context bridge](../../packages/stage-ui/src/stores/mods/api/context-bridge.ts) and [character orchestrator](../../packages/stage-ui/src/stores/character/orchestrator/store.ts) | Set the Spark host role, initialize both stores, and dispose the context bridge. These depend on the channel. |
| GAP-023 | [Plugin tools](src-web/src/renderer/stores/tools/plugins.ts), [inspector](../../packages/stage-ui/src/stores/devtools/plugin-host-debug.ts), and [Electron host](../stage-tamagotchi/src/main/services/airi/plugins/host/index.ts) | Install the inspector bridge, discover tools, subscribe to changes, register provider queries, and publish capabilities. |
| GAP-024 | [Artistry store](../../packages/stage-ui/src/stores/modules/artistry.ts) and [Electron bridge](../stage-tamagotchi/src/main/services/airi/widgets/artistry-bridge.ts) | Observe configuration, deduplicate snapshots, and send configuration to the host. |
| GAP-025 | [MCP tools](src-web/src/renderer/stores/tools/mcp.ts) and [Electron service](../stage-tamagotchi/src/main/services/airi/mcp-servers/index.ts) | Discover MCP tools when the main renderer becomes leader. |
| Model rendering scope | [Electron Godot sidecar](../stage-tamagotchi/src/main/services/airi/godot-stage/index.ts) | Query sidecar status, subscribe to changes, and select the Godot renderer. |

When a gap reopens, implement its host handlers and runtime ownership before restoring its startup connection.
For GAP-010, initialize the channel before the context bridge and character orchestrator. Keep their setup and cleanup responsibilities explicit.
Tool discovery and capability publication belong to the main renderer. Restore inspector availability only with working host operations.
Deferred startup must not block local inference preload. The old Electron cursor request remains replaced by the [Kirie pointer implementation](src-web/src/renderer/host-context/pointer.ts).

### Plugin directory import

The shared [plugin inspector](../../packages/stage-ui/src/stores/devtools/plugin-host-debug.ts) requires prepare, commit, and cancel methods.
Kirie supplies no inspector bridge, so shared `isAvailable` is false.
The shared store retains explicit unsupported-operation errors. It creates no plan and writes no files.
The shared [page](../../packages/stage-pages/src/pages/devtools/plugin-host.vue) retains its unavailable state.
The interface remains unsupported until GAP-023 reopens.

The packaging audit found no export presets, release workflow, version source, or update manifest. The package version was `0.0.0`.
A resource pack cannot update C# assemblies or native CEF libraries.
See Godot's [export guide](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_projects.html#exporting-from-the-command-line)
and [resource-pack guide](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_pcks.html#opening-pck-or-zip-files-at-runtime).
Do not substitute an Electron installer or mark a download as installed.
Update acceptance requires download, integrity checks, installation, relaunch, and channel selection with versioned Kirie artifacts.

## Dependency baseline

Kirie npm, NuGet, and the Godot addon use 0.7.0.
Godot and Godot.NET.Sdk use 4.7.2. Godot CEF uses 1.16.1.
The [0.7.0 release](https://github.com/moeru-ai/godot-kirie/releases/tag/v0.7.0) supplies official artifacts.

The addon SHA-256 is `d84d5523aac646a0cac337f7410357d0d3da5c59c2831f93214cd80db0be21f2`.
The installed `addons/kirie/godot_cef.json` supplies the CEF digest.
The macOS artifact passed strict signatures. Windows used D3D12 Forward+ with accelerated OSR.

On 2026-09-29, the NuGet v3 feed omitted both 0.6.5 packages and restore failed with `NU1102`.
That session used the official v2 feed successfully:

```sh
mise x -- dotnet restore tests/StageTamagotchiKirie.Tests/StageTamagotchiKirie.Tests.csproj --source https://www.nuget.org/api/v2/ --no-http-cache
```

The repository retained its default NuGet source.
The [0.7.0 addon](https://github.com/moeru-ai/godot-kirie/blob/v0.7.0/packages/kirie/addon/addons/kirie/csharp/KirieClient.cs) supplies the C# client wrapper.
Exact Kirie entries bypass `minimumReleaseAge`. Later releases obey the normal [pnpm policy](https://pnpm.io/settings/dependency-resolution).

Acceptance requires coordinated published packages.
Do not commit `link:` dependencies, sibling `ProjectReference` entries, or copied Kirie implementations.
Temporary sibling-source work requires dependency-boundary approval and a reproduced API gap.

## Completion requirements

- Every in-scope capability passes its platform flow, or has an explicit blocked or deferred decision.
- Published packages, CEF artifacts, and signatures match the selected baseline.
- TypeScript and C# contracts agree, errors propagate, and Godot operations stay on the main thread.
- The complete desktop flow passes on each acceptance platform.
- Deferred items retain explicit ownership and reopen conditions.

For a new failure, record its input, actual result, expected result, and owner.
Use a focused reproduction and the [README checks](README.md#checks-and-build).
For an IPC change, include a real request and response.
Complete an independent review before acceptance.

[Platform verification](docs/verification.md) and [ablation review](docs/ablation-review.md) retain dated evidence.
The [full previous migration record](https://github.com/BeanDz/airi/blob/ef7eb50e5a76265f2675e9072a7430d2dc46f09c/apps/stage-tamagotchi-kirie/MIGRATION.md) retains longer narratives.
This document reorganization adds no runtime acceptance.
