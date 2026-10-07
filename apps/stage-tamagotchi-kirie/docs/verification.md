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

## Android WebView microphone alignment, 2026-10-06

This alignment requires exact stage-pocket behavior, including existing Capacitor bugs.
Stage-pocket uses Capacitor Android 8.5.0 `BridgeWebChromeClient` for WebView capture permissions.
The AIRI Android export plugin replaces Kirie's `WebChromeClient` for file selection and external links.
That replacement previously omitted permission callbacks, so WebView denied audio capture.
It now mirrors Capacitor's resource mapping, result callback, single listener, cancellation, and lifecycle behavior.

`VIDEO_CAPTURE` requests `CAMERA`. `AUDIO_CAPTURE` requests `MODIFY_AUDIO_SETTINGS` followed by `RECORD_AUDIO`.
A combined request puts `CAMERA` first, then both audio permissions.
The callback grants `request.getResources()` when every returned Android permission value is true. It denies the request if any value is false.
An empty result map grants the request, as Capacitor does.
Unknown resource arrays and empty resource arrays receive a direct grant without an Android permission request.
Mixed arrays retain unknown resources in the full grant.

One mutable listener retains the latest WebView request. Each capture request launches its own Android permission request.
A later request replaces the listener, so an earlier Android result can resolve the later WebView request.
The listener remains installed after completion. Cancellation uses the default `WebChromeClient` callback and leaves the listener intact.
The launcher uses `ComponentActivity.registerForActivityResult` with `RequestMultiplePermissions`, as Capacitor's bridge does.
The activity owns callback delivery and registration cleanup. The plugin adds no request cancellation, destruction denial, or late-result guard.
The native Eventa permission flow remains unchanged and separate from the WebView launcher.
The amended commit includes keyboard commit `cc2fbda9f` as its parent.

| Command | Result |
| --- | --- |
| `pnpm --config.verifyDepsBeforeRun=false -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `pnpm --config.verifyDepsBeforeRun=false -F @proj-airi/stage-tamagotchi-kirie exec vitest run --config vitest.config.ts --project node src-web/src/renderer/host-context/microphone-permission.test.ts` | Three existing renderer permission tests passed. |
| `python3 /tmp/airi-microphone-parity-check.py` | Fifteen differential Java checks matched Capacitor 8.5.0 with simulated Android boundaries. |
| `mise exec -- godot --headless --export-debug Android dist/kirie/android/debug.apk` | Passed with Godot 4.7.2 Mono, including the keyboard changes. |
| `pnpm --config.verifyDepsBeforeRun=false lint` | Source scan passed with 0 errors and 682 warnings. |
| `pnpm --config.verifyDepsBeforeRun=false exec moeru-lint apps/stage-tamagotchi-kirie/addons/airi-android/export-plugin.gd apps/stage-tamagotchi-kirie/docs/verification.md` | Passed. One warning states that GDScript has no lint configuration. |
| `adb -s emulator-5554 install -r apps/stage-tamagotchi-kirie/dist/kirie/android/debug.apk` | Passed on Android 15, API 35. |
| `adb -s emulator-5554 shell am start -n ai.moeru.airi.kirie/com.godot.game.GodotAppLauncher` | Opened the WebView without a launcher registration exception. |
| `git diff --check` | Passed. |

The Java harness extracts both permission handlers and result callbacks from the application and the installed Capacitor source.
It compares audio, video, combined capture, permission denial, empty results, unknown resources, duplicate resources, overlapping requests, retained listeners, and default cancellation.
It also checks that the baseline native permission and destruction methods remain unchanged.
These checks establish parity at simulated boundaries.
The later grant-path check establishes one real input session.
Cancellation, overlap, and recreation remain pending.
The harness and build log are temporary evidence, not repository fixtures.
The export reused local web assets and native template inputs. It rebuilt the Android plugin and published C# for both configured architectures.
Godot reported a nonfatal `EditorSettings` diagnostic at shutdown. The export exited with code 0.
Root lint excludes no new paths. Generated Android artifacts and installed Kirie iOS frameworks moved outside the scan for that command.
The Android build inputs returned to the worktree afterward. No ignore rules changed, and `recordings-android` remains untouched.

The amended APK displayed the Android microphone prompt after a WebView `navigator.mediaDevices.getUserMedia({ audio: true })` request through `agent-browser`.
`adb -s emulator-5554 exec-out uiautomator dump /dev/tty` supplied the denial button bounds.
`adb -s emulator-5554 shell input tap 1212 824` selected `Don't allow`.
The WebView returned `NotAllowedError`, and `adb -s emulator-5554 shell dumpsys package ai.moeru.airi.kirie` confirmed `RECORD_AUDIO: granted=false`.
The session restored the permission flags and removed its debugging port forward afterward.
This establishes real Android denial handling.
The later grant-path check covers grant behavior.
Cancellation, overlap, and recreation still require runtime comparison with stage-pocket.
On an emulator or physical device, compare both applications through these steps:

1. With microphone permission unset, request audio capture. Grant the Android prompt and confirm a live audio track.
2. With permission granted, request audio capture again. Confirm that no Android prompt appears.
3. Revoke microphone permission. Compare denial with stage-pocket, then dismiss the next prompt and compare that result.
4. Request audio and video capture together. Compare Android permission results and the complete granted resource array.
5. Start overlapping requests, then cancel a WebView request. Compare listener replacement and late results with stage-pocket.
6. Destroy or recreate the activity during a prompt. Compare callback delivery and restart behavior with stage-pocket.
7. Return from Android settings after permission changes. Compare native permission state and subsequent audio capture.
8. On a physical device, record microphone audio through the normal hearing flow and confirm usable input.

## Invalidated Android renderer evidence

Recordings from commit `024d35aca` through `dc02e73e9` packaged the stage-pocket Web build inside Kirie.
They do not establish parity for the universal Kirie renderer.
Native host results remain valid only when they do not depend on the packaged page.

## Universal Android renderer correction, 2026-10-07

Kirie Android now builds and packages `src-web/dist/index.html`.
The Android build no longer invokes the stage-pocket Vite build.
Stage-pocket source matches `origin/main` after removing the Kirie-only renderer bridge.

| Command | Result |
| --- | --- |
| `pnpm --config.verifyDepsBeforeRun=false -F @proj-airi/stage-pocket typecheck` | Passed. |
| `pnpm --config.verifyDepsBeforeRun=false -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `dotnet build --no-restore` | Passed with no warnings or errors. |
| `pnpm --config.verifyDepsBeforeRun=false -F @proj-airi/stage-tamagotchi-kirie build` | Passed. |
| `pnpm --config.verifyDepsBeforeRun=false -F @proj-airi/stage-tamagotchi-kirie exec kirie export android --build=false` | Passed. |
| Android WebView parity fixture `assembleDebug` | Passed with JDK 21 and Gradle 8.14.3. |
| Android WebView parity fixture `assembleDebugAndroidTest` | Blocked because the offline cache lacked AndroidX Test 1.3.0 and Runner 1.7.0. |
| `unzip -l apps/stage-tamagotchi-kirie/dist/kirie/android/debug.apk` | Found the universal HTML files and no Android renderer directory. |
| `pnpm --config.verifyDepsBeforeRun=false -F @proj-airi/stage-pocket lint` | Passed with one existing warning. |
| `pnpm --config.verifyDepsBeforeRun=false lint` | Failed with 4,808 existing errors, mainly from generated Kirie iOS framework files. |

The debug APK SHA-256 was `499c21ff298c2cc20d9faac2fa387104b6d1c9ca59891ac288b8ee907d1b3c08`.
It was 501,304,381 bytes.
The API 36 emulator used WebView 133 and the host NVIDIA GeForce RTX 3060.
The application process remained alive after a clean-data launch.
Chrome DevTools confirmed the universal renderer URL and Kirie's stage controls.
Godot logged nonfatal Vulkan presentation errors while the WebView remained interactive.

The node Vitest project passed 10 files and 32 tests.
The browser project could not start because the environment lacked `libglib-2.0.so.0`.
This environment failure happened after the node tests passed.

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
