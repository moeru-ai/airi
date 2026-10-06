# Android startup surface

Kirie uses stage-pocket's Android renderer from the first web frame through the interactive stage.
The native splash remains a separate alignment point.

## Native handoff

`AiriAndroidPlugin.onMainCreate` creates the Android WebView directly.
It installs the AIRI Eventa channel before loading the packaged page.
Kirie still supplies the asset handler, URL resolver, and development TLS policy.
The host view becomes the plugin's Android view. Its lifecycle belongs to the Android activity.

The opaque host uses stage-pocket's themed window background until web content paints.
It covers the Godot surface while retaining Android's normal first-draw handoff.
There is no native keep-on-screen condition or added timer.

Godot's scene adopts the running page through `loadBrowserUrl`.
The default URL does not reload the page or reset progress and input state.
An explicit development URL still replaces the default page.
The Android renderer uses `AiriAndroidEventa`, not the desktop Kirie IPC channel.
Desktop WebView creation remains in the Godot scene.

## Packaged assets

Kirie exposes the Android renderer at `https://res.kirie.invalid/src-web/dist/android/index.html`.
Stage-pocket's Vue startup screen requests `/favicon.svg` from the origin root.
The Android client resolves root asset requests inside `src-web/dist/android` through Kirie's asset handler.
Requests that already contain the packaged renderer prefix retain Kirie's original interception.
External navigation and development TLS handling retain their existing client policy.

## Shared behavior

The export builds stage-pocket's existing `index.html`, `App.vue`, `StartupOverlay`, and `StartupScreen`.
It does not replace them with a native imitation.

| Phase | Stage-pocket behavior retained by Kirie |
| --- | --- |
| HTML bootstrap | Blue favicon, AIRI label, saved hue, language, and theme. No progress label yet. |
| Vue startup | Same logo, Comfortaa font, resource progress, and 500 ms minimum display interval. |
| Loading | Stage content has `inert` and `aria-hidden="true"`. |
| Ready | The shared startup store releases the stage and the 250 ms overlay exit transition runs. |
| First run | The existing welcome dialog opens after startup. |
| Failure | The same resource errors, retry, model alternative, and 15-second bootstrap recovery timer. |

The web loading surface uses `#ffffff` in light mode and `#171717` in dark mode.
The brief empty window before web content paints retains AppCompat's `#fafafa` light and `#303030` dark backgrounds.
Saved light or dark preferences override the system preference through the existing web bootstrap.
Native system bars retain stage-pocket's Android colors, including `#303030` in system dark mode.
The bootstrap's initial theme-color metadata and font change remain unchanged, including its automatic-dark metadata quirk.
The chat textarea is teleported to `body`, outside the covered stage wrapper.
Both applications allow its programmatic focus during loading. The loading surface still covers pointer access to the stage.

## Cold-start comparison

Use a dedicated emulator. Confirm ownership before using an existing target.
Use the same emulator, WebView version, orientation, permissions, app settings, and model cache for both applications.
For each application, force-stop its package and return to Home before recording.
Start `screenrecord`, wait one second, then launch the MAIN/LAUNCHER activity with `am start -W`.
Keep recording through the first interactive stage or first-run welcome dialog.
Verify `LaunchState: COLD` for each launch.
Repeat with system night mode off and on. Also test saved web theme overrides.
Restore animation scales, rotation, and night mode after the comparison.

Extract frame numbers and presentation timestamps with `ffprobe -show_frames`.
Cut each still with `ffmpeg -vf 'select=eq(n,FRAME)' -frames:v 1`.
Compare the last native frame, first web frame, bootstrap, resource loading, overlay exit, and interactive stage.
For a static comparison, build the timeline from those PNG files only.
For an event-aligned video, trim both raw recordings at the same observed event. Retain their playback speed.
Keep the original recordings and a manifest of source filenames, frame numbers, timestamps, and APK hashes.

Wall-clock duration depends on resource readiness, emulator load, and cache state.
The comparison preserves each application's timestamps rather than stretching one recording to match the other.

## Verification on 2026-10-06

The change starts from `5db71040a4b66ecc40d28da55107075cc5c80934`.
Both rebuilt APKs ran on a dedicated API 35 emulator at `emulator-5680`, through adb server port `5039`.
The default adb server did not list this emulator. An earlier all-device instrumentation run contaminated the initial shared-server captures.
The acceptance recordings use the isolated target only.

The installed APK hashes matched their build artifacts.
Pocket's SHA-256 is `6dcda40d09ec8223993ea9043e0987f94ec300ad60dc4b9fd3c3ce89f3fbf907`.
Kirie's SHA-256 is `86522aa9fdb1581d9eacdacdfaad0204bfb87604bf38c4a964e4e746e44e29c3`.
The favicon assets, inline bootstrap CSS, and inline bootstrap scripts matched byte for byte between the APKs.
The favicon has 32,232 bytes and SHA-256 `8e41deba5f91083bf5e1f7180dfbb2313b67578e240f8d29e7036193e8b503b1`.
The compiled manifests select API 26 minimum and API 36 target.
Runtime acceptance covers API 35. Earlier supported APIs use the same host and resource policy.

All eight acceptance launches reported `LaunchState: COLD` and reached the interactive stage.
These cover automatic light and dark mode, saved light with system dark, and saved dark with system light.
Each WebView retained one navigation through Godot scene initialization.
The loading wrapper's `inert` and `aria-hidden` state matched, including the teleported textarea behavior.
A background scan checked every frame of the four automatic-theme recordings for a black startup surface.
None contained that surface. The temporary timeline contains ten static PNG pairs, each held for three seconds.

| API 35 automatic mode | Last native frame | Empty window | HTML bootstrap | First stable stage |
| --- | --- | --- | --- | --- |
| Pocket, light | n18, 2.547311 s | n19, 2.564756 s | n26, 3.085533 s | n156, 7.067289 s |
| Kirie, light | n17, 2.481422 s | n18, 2.495256 s | n28, 3.042422 s | n167, 8.977856 s |
| Pocket, dark | n15, 2.486922 s | n16, 2.520500 s | n23, 3.057178 s | n158, 6.423889 s |
| Kirie, dark | n10, 1.799067 s | n11, 1.811878 s | n17, 2.016078 s | n151, 6.449344 s |

Frame indices start at zero. Times are the source recordings' presentation timestamps.
The frame manifest and comparison artifacts reside in `/tmp/airi-post-native`.
The original `recordings-android` files remain untracked and unchanged.

Native taps and typed input reached the ready stage in both applications. No chat message was sent.
A separate post-start keyboard check measured a 540 CSS-pixel viewport in Kirie and 564 in Pocket.
The pre-change Kirie APK reproduced 540 pixels.
The keyboard inset handler now removes the duplicated navigation-bar inset that caused this 24-pixel difference.
The post-change Android 15 run measured 564 CSS pixels in both applications.

| Command | Result |
| --- | --- |
| `pnpm -F @proj-airi/stage-pocket build` | Passed. |
| `pnpm exec cap sync android` in stage-pocket | Passed. Generated tracked Gradle changes were restored after building. |
| `JAVA_HOME=/Users/lemonneko/.local/share/mise/installs/java/temurin-21.0.11+10.0.LTS ./gradlew :app:assembleDebug :app:testDebugUnitTest --console=plain` in Pocket's Android directory | Passed. Seven cached native unit tests had no failures. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie build:android` | Passed. Web, C#, and Android builds completed. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie exec kirie export android --build=false` | Passed. Final native host rebuilt against the existing web build. |
| `pnpm -F @proj-airi/stage-pocket typecheck` | Passed. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed. Twelve files and 38 tests. |
| `dotnet run --project tests/StageTamagotchiKirie.Tests` in Kirie | Passed. |
| `dotnet format StageTamagotchiKirie.csproj --verify-no-changes` in Kirie | Passed. |
| `pnpm exec moeru-lint apps/stage-tamagotchi-kirie/src-web apps/stage-tamagotchi-kirie/docs apps/stage-tamagotchi-kirie/README.md` | Passed with existing warnings. |
| `pnpm lint` | Failed on generated Kirie iOS ABI files and native build outputs. Reported 4,786 errors and 682 warnings. |
| `git diff --check` | Passed. |

## WebView 113 startup blocker

Kirie 0.8.0's `KirieWebViewManager.createWebView` installs desktop IPC before attaching the view or loading its URL.
Its `installMessageChannels` method requires both `WEB_MESSAGE_LISTENER` and `WEB_MESSAGE_ARRAY_BUFFER`.
Its runtime injection also requires `DOCUMENT_START_SCRIPT`.
WebView `113.0.5672.136` lacks ArrayBuffer messages. The manager reports an error and returns with no attached page.
The exported APK contains the HTML and assets. Missing web files do not cause this failure.

Pocket's Capacitor 8.5.0 `MessageHandler` installs a string listener. It does not require ArrayBuffer messages.
AIRI's Android renderer also uses string messages through `AiriAndroidEventa`. It does not use Kirie's desktop channels or runtime injection.
The Android activity now owns the WebView directly, with the same string transport requirement as Pocket.
The host attaches the view, installs existing settings and callbacks, then loads the resolved URL once.
Godot scene adoption retains the running document. Activity destruction removes and destroys the owned view.
The Android path does not emit the unused desktop `KirieNode.webview_ready` signal.
An attached DevTools target, a responsive document, and interactive routes establish Android readiness.

`StartupTest` executes the production `onMainCreate` method and loads a packaged HTML fixture.
It checks native string replies, input focus, route changes, and document retention during scene adoption.
On Android 14 with WebView 113, the test fails before this fix because no WebView attaches.
The existing callback tests only installed the channel on a pre-created WebView. They did not cover this creation gate.

### Verification on 2026-10-07

The worktree rebased onto `f896e786eed1fe5ffb5de70d75c8641e5fc8aea2`.
The dedicated Android 14 clone used `emulator-5680` and adb server port `5039`.
Its default WebView was `113.0.5672.136`. Other sessions' emulators remained outside this test scope.
The original APK reproduced the ArrayBuffer error and retained zero DevTools targets across 35 samples over 16 seconds.
The fixed APK retained one visible target and one document through native route taps and Back navigation.
Both applications reached `/settings`, `/settings/system`, and `/settings/system/general` in light and dark mode.
Kirie retained its document for 38.135 seconds in light mode and 47.469 seconds in dark mode.
These durations use the host event log's monotonic clock, separate from video presentation timestamps.

The installed APKs matched the inspected build artifacts byte for byte.
Pocket's SHA-256 is `3bca05f3d101c0c7bb8ed90baffbc30ef4722732d057de289961ac0d8e6a0f9d`.
Kirie's SHA-256 is `9560b50c464abed20394ac55028b6e42a9196bca1e072df0834eb169c85600ef`.
All 1,351 Android web asset files matched between the original and fixed Kirie APKs.
Pocket and Kirie retained identical favicon bytes, inline bootstrap scripts, and inline bootstrap styles.
The final APK's `classes4.dex` contains direct WebView creation in `AiriAndroidPlugin`, with no `KirieWebViewManager` reference in that class.

| Capture | Last native frame | First web frame | First complete stage frame |
| --- | --- | --- | --- |
| Pocket, light | n11, 1.577122 s | n19, 1.840878 s | n75, 3.192033 s |
| Kirie, light | n13, 1.779211 s | n22, 2.235778 s | n193, 8.762211 s |
| Pocket, dark | n12, 1.764889 s | n19, 2.275922 s | n146, 6.000078 s |
| Kirie, dark | n12, 1.851222 s | n21, 2.367033 s | n173, 9.461456 s |

These times are source MP4 presentation timestamps. Frame indices start at zero.
The recordings preserve actual durations. Resource readiness and emulator load still affect elapsed time.
The loading overlay retains Pocket's existing minimum display interval and interaction gate.

The evidence directory is `recordings-android/android14-webview113-startup-alive-f896e786e-20261007/` under the shared repository root.
It contains four raw route recordings, two event-aligned videos, the failing baseline recording, exact frames, event logs, and artifact evidence.
The aligned videos place the first AIRI web frame at three seconds, with Pocket on the left.
They retain playback speed and hold the first Home frame before each shifted recording.
The shorter recording holds its final frame until the longer recording ends.
`comparison-manifest.json` records exact frame indices, timestamps, offsets, hashes, and encoding commands.

For a repeat comparison, use the same owned emulator, APKs, saved settings, and model cache.
Set automatic web theme and the same onboarding state in both applications.
Wait six seconds after each storage seed before force-stop, so Chromium writes its preferences.
Record each application serially through cold launch, the ready stage, settings routes, and Back navigation.
Stop screenrecord with a device-side SIGINT. Wait for recorder exit before pulling the raw MP4.
Find each first AIRI web frame with ffprobe and static frame cuts. Shift both recordings to that common event.
Do not stretch either recording. Retain raw files and report host event times separately from video timestamps.

| Command | Result |
| --- | --- |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie build:android` | Passed for the unmodified baseline. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie exec kirie export android --build=false` | Passed for the fix. |
| `pnpm -F @proj-airi/stage-pocket build` and `pnpm exec cap sync android` | Passed. Generated tracked Gradle changes were restored. |
| `./android/gradlew -p android :app:assembleDebug :app:testDebugUnitTest --console=plain` in Pocket | Passed. The native test task was up-to-date. |
| Standalone parity Gradle `assembleDebug assembleDebugAndroidTest` | Passed before and after the fix. |
| Explicit-device `am instrument` for `StartupTest` before the fix | Failed as expected because no WebView attached. |
| Explicit-device `am instrument` for the full parity suite after the fix | Passed all 21 tests. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed 12 files and 38 tests. |
| Focused `pnpm exec moeru-lint` for changed paths | Passed. GDScript has no matching lint configuration. |
| `pnpm lint` | Failed on generated native outputs. Reported 3,229 errors and 682 warnings. |
| FFmpeg decode of all four raw route videos and both comparisons | Passed. |
| `git diff --check` | Passed. |
