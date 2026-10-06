# Android startup surface

Kirie uses stage-pocket's Android renderer from the first web frame through the interactive stage.
The native splash remains a separate alignment point.

## Native handoff

`AiriAndroidPlugin.onMainCreate` creates the WebView through Kirie 0.8.0's `KirieWebViewManager`.
It installs the AIRI Eventa channel before the manager loads the packaged page.
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
Build the comparison timeline from those static PNG files only. Do not insert moving source segments.
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
The pre-change Kirie APK reproduced 540 pixels. This existing keyboard difference is outside the startup interval covered here.

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
