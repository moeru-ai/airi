# Kirie platform verification

This document retains dated migration checks and their evidence.
[Migration status](../MIGRATION.md) owns current acceptance decisions and open failures.
[Ablation review](ablation-review.md) records the later macOS simplification checks and resize cursor work.

## Reading the evidence

Each result applies to its recorded platform, dependency baseline, and checked flow.
A build or route check does not establish native desktop acceptance.
Historical passes do not establish coverage for later source changes.
Local temporary artifacts are evidence references, not committed fixtures.

## Main merge integration checks (2026-09-29)

Merge `f65867e29` incorporated `origin/main` at `b40e3e87b`.
The recorded macOS checks covered builds and automated behavior. They did not repeat native UI acceptance.

Root typecheck passed all 54 tasks. The Web and C# build and C# contract tests passed.
Vitest passed 107 tests: 42 Kirie, 45 provider unit, six provider browser, four microphone browser, and ten tool-rerun tests.
Root lint reported errors in Git-ignored native and generated files. The merge's staged-source lint passed.

These results describe the merge baseline. They do not establish coverage for later ablations.
These checks do not change the platform acceptance matrix or close the deferred plugin-host work.

## Windows environment and checks

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
The [README commands](../README.md#checks-and-build) provide the normal verification sequence.

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

## Windows microphone permission evidence

Permission state, reset, and grant persistence passed.
The original acceptance run stopped the application-owned audio track from `live` to `ended` and left audio input disabled.

A later interface check granted microphone access, opened Chat, and revoked access through Settings > Permission Management.
The permission state changed to `not-determined`, and Settings displayed `Not set`.
Chat logged ``Must be called at the top of a `setup` function`` through `useI18n`, `useAnalytics`, and the audio device store.
The check did not establish a failure of permission revocation or Chat use.

The user accepted GAP-016 and excluded this exception from migration failures.
This record retains the observation without a repair requirement. No application code changed for this decision.

## Windows Chat evidence

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

## Windows Spotlight correction

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

## Historical macOS evidence

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

## AUV test method and limits

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

## Local evidence and cleanup

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
