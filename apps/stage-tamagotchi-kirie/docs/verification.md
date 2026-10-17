# Kirie platform verification

[Migration status](../MIGRATION.md) owns current acceptance.
[Ablation review](ablation-review.md) owns simplification evidence.
Each result applies only to its platform, dependency baseline, and checked flow.
Builds and route checks do not establish native acceptance or coverage for later changes.

The [immutable full record](https://github.com/BeanDz/airi/blob/ef7eb50e5a76265f2675e9072a7430d2dc46f09c/apps/stage-tamagotchi-kirie/docs/verification.md) retains commands, route lists, and capture IDs.
Temporary local artifacts are evidence references, not repository fixtures.

## Recorded checks

| Baseline | Commands and results |
| --- | --- |
| Main integration, 2026-09-29, merge `f65867e29` from `b40e3e87b` | Root typecheck: 54 tasks passed. Web/C# builds and C# tests passed. Vitest: 107 tests passed. Staged-source lint passed. Root lint failed on ignored artifacts. |
| Windows, 2026-09-29, application `fdc9161c8` | Application typecheck passed. Vitest: 13 files, 42 tests passed. C# tests and Web/C# build passed without C# warnings. |
| Same Windows session | Root typecheck: 53 tasks passed, 52 cached. Root lint: 41 artifact errors. `git diff --check` passed. |
| Windows Spotlight correction | C# build, C# tests, `dotnet format --verify-no-changes --no-restore`, and root typecheck passed. Root lint retained 41 errors. |

The [README](../README.md#checks-and-build) supplies the command sequence.
Historical ablation command results remain in the [ablation batch record](ablation-review.md#historical-command-results).
No check in this table extends the platform matrix after later simplifications.

## Windows acceptance evidence

The session used Godot 4.7.2 Mono, Kirie 0.6.5, CEF 1.16.1, and an NVIDIA RTX 4060 Laptop GPU.
One 3200 × 2000 display used 200% scaling. The missing Android SDK was outside scope.

Twelve Settings and Devtools routes displayed their headings without a route error.
Native captures established transparency, pin/unpin z-order, notification behavior, external links, directory access, and the connected Inspector.
Settings and Chat closed through native title bars and reopened.
Chinese locale normalized from `zh-CN` to `zh-Hans` and survived restart. Restored English survived another restart.
Main and Chat shared locale, permission, localStorage, and a persistent cookie.
Physical Ctrl+Shift+K produced complete foreground and background down/up pairs.
The user accepted displays, movement, onboarding, sign-in, resize, and microphone state.

### Windows microphone permission evidence

State, reset, grant persistence, follower denial, and application-owned stream revocation passed.
The owned track changed from `live` to `ended`, and audio input remained disabled.
A later Settings revocation returned `not-determined` and displayed `Not set`.
Chat logged ``Must be called at the top of a `setup` function`` through i18n, analytics, and the audio store.
The check did not establish a revocation or Chat failure.
The user accepted GAP-016 and excluded this exception from migration failures. No repair requirement follows from this observation.
One post-restart capture failed transiently. [Migration status](../MIGRATION.md#open-windows-failures) retains that unresolved observation.

### Windows Chat evidence

The original stall awaited microphone state without a Chat handler.
The host attachment fix is present, and that initialization failure did not recur.
A temporary loopback provider returned deterministic SSE replies through the Chat UI.
Initialization and two sends completed. Both messages and replies remained saved.

The test also switched to the original conversation after a send.
Selection of the test conversation restored its reply.
The record does not reproduce that switch through normal session creation and selection, or exclude test setup effects.
It does not establish a migration failure, a source cause, or an earlier macOS repair.

### Windows Spotlight correction

Before correction, direct open created a CEF target without a visible native window.
The host reported `visible=true` and `focused=true`.
The HWND style was `0x860B0000`, and `IsWindowVisible` returned `false`.
After correction, the style was `0x960B0000` and visibility returned `true`. The difference is `WS_VISIBLE`.

Repeated borderless, topmost, resize, and focusability assignments after `Show()` rewrote Windows styles.
Godot's internal visibility stayed true, so another `Show()` did not restore native visibility.
The fix removes those four repeated assignments and retains scene flags, transparency, native focus, and CEF focus.
See [Godot Windows display code](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/windows/display_server_windows.cpp)
and [Window code](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/window.cpp).

Direct open, repeated open, and hide/reopen passed.
Scan-code `SendInput` Ctrl+Shift+A displayed Spotlight and focused its input.
The native capture showed transparent surroundings at `(880, 419, 1440, 200)`.
Physical keyboard and macOS regression checks remain pending. No dependency changed.

## Historical macOS evidence

| Date and baseline | Recorded scope |
| --- | --- |
| 2026-09-17, Kirie 0.3.0, Godot 4.7.1 | Host adapters, windows, permissions, navigation, and authentication |
| 2026-09-18 | All 117 static routes and three parameterized routes in CEF, Inspector, and account state |
| 2026-09-19, CEF 1.16.0 | Cross-window cookie, storage, BroadcastChannel, and Web Lock probes |
| 2026-09-20, Kirie 0.4.1, CEF 1.16.1 | Native reopen, links, directory, notice, shared context, and repaired Chat send |
| 2026-09-21, Kirie 0.4.2, Godot 4.7.2 | Metal Forward+ accelerated OSR, repeated context checks, and user Spotlight/notification acceptance |
| 2026-09-24, Kirie 0.6.2 | Main startup and dependency/build checks |
| 2026-09-29, Kirie 0.6.5 | 36 Node and six browser tests passed. Earlier lint recorded 32 artifact errors. |

Widget, desktop-overlay startup, and inlay windows lack recorded runtime coverage.
Kirie does not create the inlay window. Its route retains Electron references.
`godot-stage:get-status` remains outside the model-free milestone.
A surface becomes a gap after an in-scope failure reproduces.

## Automation and evidence limits

AUV 0.0.22, commit `2957b9ff`, ran without a dependency patch.
A fresh clone with `core.symlinks=true` resolved the initial proto-symlink checkout failure.
See [Git symlink configuration](https://git-scm.com/docs/git-config#Documentation/git-config.txt-coresymlinks).

Windows operations succeeded through `auv serve` and an explicit Device, despite direct CLI failures.
See the [Windows Runner guide](https://github.com/moeru-ai/auv/blob/2957b9ff/docs/ai/references/session-api/2026-08-16-windows-local-runner-ipc-handoff.md).
At 200% scaling, captures and bounds used physical pixels. Input used logical coordinates.
Input `(1111, 700)` placed the pointer near physical `(2223, 1401)`.

AUV `input.key` rejected Windows. Synthetic combinations through `input.holdKeys` reached CEF without shortcut callbacks.
AUV writes zero scan codes, while Kirie matches scan codes. This explanation remains a hypothesis.
Physical Ctrl+Shift+K passed. Automation failure alone cannot reject the shortcut capability.
See [AUV input](https://github.com/moeru-ai/auv/blob/2957b9ff/crates/auv-driver-windows/src/input.rs)
and [Kirie Windows shortcut runtime](https://github.com/moeru-ai/godot-kirie/blob/v0.6.5/packages/GdKirie.Platform/src/GlobalShortcuts/WindowsGlobalShortcutRuntime.cs).

Temporary captures and logs remain under `airi-auv-windows-probe/`, `airi-auv-acceptance-records-20260929/`, and `airi-gap007/`.
The immutable full record retains their run IDs.
The session removed providers, conversations, cookies, storage probes, shortcuts, and audio tracks, then stopped the provider.
It restored English, granted microphone permission, and disabled audio input.
Original acceptance changed no source or dependency files. The later Spotlight correction changed C# source.

## Current framework batch

The 2026-09-30 framework simplification changes the host adapter and renderer bootstrap.
The batch removes the local Electron runtime alternative and automatic startup of deferred Node services.
It removes two obsolete Electron test cases and the static updater test file. No permanent test was added.

| Command | Result |
| --- | --- |
| `mise x -- pnpm typecheck` | Passed, 54 tasks including the Kirie application. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed, 12 files and 38 existing tests. |
| `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie build` | Passed, Web assets and C# assembly. C# reported no warnings or errors. Existing Web build warnings remain. |
| `mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests` | Passed from the application directory. |
| `mise x -- pnpm kirie dev` | Native macOS session started with Metal Forward+ and accelerated OSR. Application quit returned process code 0 and four ObjectDB leaks. |
| `git diff --name-only --diff-filter=ACMR -z \| xargs -0 mise x -- pnpm exec moeru-lint` | Passed with no errors and seven existing warnings. |
| `mise x -- pnpm lint` | Failed with 1,715 errors and 698 warnings. All error files were ignored artifacts. |
| `git diff --check` | Passed. |

The native review used Kirie 0.6.5, Godot 4.7.2, and CEF 1.16.1.
Real Eventa requests opened Settings and Chat. Repeated requests reused their existing CEF targets.
The permission page displayed its heading and stored denial without a route error.
Chat initialized and displayed its input. This review did not send a provider request.
The shared plugin inspector reported `isAvailable=false`.
The leader's local Kokoro preload reached its ready state. The log contained no deferred bootstrap request failures.

Spotlight repeated open retained one target. Its own renderer hid the native window, and Main reopened it with focused input.
The review invoked native contracts through `agent-browser`. It did not exercise physical keyboard or title-bar actions.
Two probes used the wrong renderer for a window-specific handler and were stopped. Their pending requests are excluded from acceptance evidence.
The quit request closed CDP before its response arrived. The process exit establishes teardown completion, not successful quit-response delivery.
The existing leaks, Vue attribute warning, and native dependency warnings remain unresolved.
These checks do not establish Windows acceptance, authentication, Chat send, model rendering, or safe CEF shutdown on every platform.

## Electron alignment: chat and weather (2026-10-17)

Reference: Electron at `dd6e3ce1f`.

The Kirie composer now uses the shared image, voice input, send, interruption, and provider setup controls.
Chat history also shows background tasks and weather result widgets.
The weather tool returns current conditions and up to seven forecast days.
The chat shell supplies an opaque light or dark background.

Checks:

- `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck`: passed.
- `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit`: 59 tests passed in 14 files.
- `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie build`: passed, including the C# build.
- CEF 2.0.0 passed `codesign --verify --deep --strict` on this Mac.

The native Kirie Chat opened through the stage controls.
Electron opened its floating Chat through the same control.
Their input controls supplied the behavior comparison.
These checks do not establish floating window, voice capture, plugin, MCP, or production update acceptance.

## Native widget alignment (2026-10-18)

The Godot host now owns widget snapshots, reserved IDs, native windows, pin state, logical size constraints, and expiry timers.
Main, Settings, Developer, and Widget contexts use the same typed Eventa contracts.
A widget fetch supplies its initial snapshot before mutation events start.
The close button sends an event, because its transport closes with the window.

The Widget Calling developer window opened through its existing native diagnostic handler.
Its real Spawn control displayed the Tokyo weather preset in a separate native window.
The widget pin control changed to Unpin. Its close control removed the native window and CEF target.
The final run produced neither the early-send warning nor the close RPC error found during development.

Validation:

- `dotnet build`: passed with zero warnings and errors.
- `dotnet run --project tests/StageTamagotchiKirie.Tests`: passed, including widget wire payload checks.
- `dotnet format --verify-no-changes`: passed.
- `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit`: 76 passed and one optional provider test skipped.
- `mise x -- pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck`: passed.
- `mise x -- pnpm lint`: passed with existing warnings.

This adds native widget lifecycle support. Plugin iframe requests and Artistry generation still require their deferred hosts.

The one-second expiry also removed the native window, CEF target, and host snapshot.
The root `mise x -- pnpm typecheck` passed all 56 workspaces.

## Local chat streams and voice controls (2026-10-18)

The main renderer starts the shared local context bridge. Minimal Chat starts its stream view.
The local runtime supplies chat progress, tool results, speech hooks, and cancellation without the deferred server host.
Spoken turns now receive the same built-in tool references as typed turns.

The stage supplies the current microphone toggle, permission wait state, speech mute, and focus-aware control hiding.
Push to Talk uses Kirie's global shortcut adapter, including key-down and key-up delivery.
The Window Shortcuts page records and resets its accelerator. Spotlight conflict checks use the host-owned shortcut.

A real model request returned Tokyo's three-day forecast in the follower Chat window.
Its weather tool card displayed the current weather and the three forecast days.
The shortcut recording flow changed the accelerator to F8, then restored Ctrl+Shift+Space.
The microphone remained disabled. Physical hold-to-capture and speech playback remain unverified.
Speech playback reported that its model and voice were unconfigured.

Checks:

- Shared context bridge browser tests: 31 passed, including two tests with real Pinia stores and transport.
- Kirie tests: 77 passed and one optional provider test skipped.
- Stage UI and Kirie workspace typechecks: passed.
- Root typecheck: all 56 workspaces passed.
- Repository lint: passed with existing warnings.

The recordings use agent-browser's fixed-quality H.264 encoder at requested 60 fps and native page dimensions.
Frame receipts distinguish captured frames from encoded frames. They do not prove 60 distinct paints each second.


## Native floating chat (2026-10-18)

The Godot chat manager persists classic, attached, free, and message-feed styles.
One renderer and composer survive style changes and native close or fold.
Attached placement follows the main window and clamps to its display's work area.
Free placement has its own pin. Attached and message-feed placement follow the main window's pin.
The transparent feed uses the current Electron reading timers, folded composer, and pointer hit testing.
Experimental fullscreen chat remains unimplemented.

The real style menu changed classic chat to free floating, then message feed and attached placement.
An unsent test draft survived every change, fold, and reopen. The test draft was then removed.
The native attached window appeared 12 logical pixels beside the stage, with matching bottom edges.
Native capture reported zero alpha in its empty area. Fold removed Chat from the visible native window inventory.
The main button changed from Hide Chat to Open Chat, then reopened the same CEF target.

Checks:

- Shared reading timer tests: 15 passed. Electron feed menu tests: two passed.
- Kirie tests before helper relocation: 92 passed and one optional provider test skipped.
- Native contract tests: passed, including style validation and JSON field names.
- Kirie typecheck: passed.

These checks do not establish native drag, resize, multiple-display, Windows, or fullscreen acceptance.

The development toolbar initially covered the folded composer tab. Its normal drag control moved it to the side.
The subsequent recording expanded the composer through real pointer input and displayed the retained draft.
The earlier blocked take remains a failed demonstration, not an acceptance result.


## Native voice inlay (2026-10-18)

Electron and Kirie now use the shared speech presentation component.
The Godot host supplies a pinned, transparent minimal follower window, bounded home geometry, reuse, and display-area tracking.
Its native bounds matched the running Electron inlay: 520 by 200 logical pixels at the same desktop position.
The real voice host reported connected, with no input or drafts. The microphone stayed disabled.

A recording explicitly marked simulated speech showed the listening capsule and live transcript card through the real speech bus.
The fixture was removed by requesting the real host snapshot. No transcription or microphone acquisition occurred.

AUV's targeted keyboard and System Events input paths did not establish background Escape delivery.
A direct CoreGraphics HID Escape produced one native Eventa notification and dismissed the simulated capsule.
For the final check, Electron's chat menu had focus while the Kirie inlay stayed unfocused.
The same HID Escape closed the Electron menu and the Kirie capsule. Electron retained focus.
The observer already had system permission. The session changed no system privacy permissions.
This verifies software-generated native HID input. It does not establish physical keyboard acceptance.

Checks:

- Kirie tests: 89 passed and one optional provider test skipped, including 12 inlay adapter tests with real voice state.
- Electron inlay tests: 11 passed with the shared presentation component.
- C# build and native geometry tests: passed.
- Stage UI, Kirie, and Electron typechecks: passed.
- Root typecheck: all 56 workspaces passed.

Physical microphone capture, Push to Talk holds, configured speech playback, Windows, and multiple displays remain unverified in this session.
Plugin hosting, Artistry, MCP, server channels, and production packaging retain their recorded deferred decisions.
