# Remaining Android WebView surfaces

The reference is stage-pocket with Capacitor Android 8.5.0.
The starting branch is `45da0f52d25415849e4fd3ffabc23253bee9cc61`.
The differential excludes dialogs, basic picker callbacks, lifecycle, downloads, and clipboard behavior.

## Geolocation

Reference: `BridgeWebChromeClient.onGeolocationPermissionsShowPrompt`, lines 246–273, and `util/PermissionHelper.hasPermissions`, lines 25–32.
These files reside in stage-pocket's installed `@capacitor/android/capacitor/src/main/java/com/getcapacitor` directory.

Kirie requests coarse and fine location together unless both permissions are granted.
After a rejected fine-location request, Android 12 and later accept coarse location if it is granted.
Earlier Android versions reject that result.
Every callback uses the original origin and `retain=false`.
The shared permission listener retains its last callback, including after completion.
Empty permission maps count as granted, as in Capacitor.
A later request replaces an earlier listener without completing the earlier callback.

Neither packaged application declares location permission.
Kirie keeps this Pocket bug. It does not add manifest permissions or a custom site prompt.
The native permission request consequently denies location in the normal packaged application.

The focused fixture compiles the installed reference client unchanged.
Before the change, all four geolocation tests failed because Kirie inherited an empty prompt callback.

## File-input capture

Reference: `BridgeWebChromeClient.onShowFileChooser`, `isMediaCaptureSupported`, `showMediaCaptureOrFilePicker`, both capture pickers, and both image-file helpers.

Only exact `image/*` and `video/*` entries select capture when `isCaptureEnabled()` is true.
Both entries select video. Specific MIME types, extensions, case differences, whitespace, and audio remain document-picker inputs.
The input mode does not alter the capture branch. Multiple selection still starts one capture.
Camera permission is requested only when the manifest declares it and it is not granted.
A denied permission completes the callback with null. It does not open a document picker.
Both apps declare camera permission through their barcode dependencies.

An absent handler or image-file failure falls back to the existing document picker.
Package visibility can hide an installed camera handler. No camera query entries are added to either application.
The instrumentation fixture adds camera query entries only to exercise the hidden successful-capture branches.

Image capture creates a timestamped `JPEG_*.jpg` in the external Pictures directory.
The existing Godot FileProvider exposes that directory through the application's `.fileprovider` authority.
The intent includes `EXTRA_OUTPUT` and both read and write grants.
An OK result returns the output URI without inspecting the result Intent or image contents.
Cancellation returns null. The file remains on disk, as in Pocket.

Video capture has no output URI or additional grant flags.
An OK result returns `data.getData()`. An OK result with a null Intent throws `NullPointerException`.
An Intent with a null data URI returns a one-element array containing null.
Cancellation returns null.

Capture and the existing picker share one retained activity-result listener.
A new launch replaces the listener without completing the earlier callback.
This moves the existing picker result branch without changing its conversion, cancellation, or null-Intent behavior.
The media listeners remain installed after completion and after destruction, matching the existing retained picker behavior.
Capture launch exceptions are not caught. Only the existing picker catches `ActivityNotFoundException`.

Four of six capture tests failed before implementation.
The tests compare capture selection, permission denial, URI grants, photo results, video results, and listener replacement against the installed reference.

## Fullscreen custom views

Reference: `BridgeWebChromeClient.onShowCustomView` and `onHideCustomView`, lines 86–99.
Pocket immediately invokes `onCustomViewHidden()`, then calls the platform superclass.
It does not attach the custom view or change orientation, bars, or the original WebView.
The hide callback calls only the superclass.
Kirie retains this rejection behavior. It does not add a fullscreen video surface.
The deprecated orientation overload retains its inherited platform behavior in both clients.

The pre-change test observed zero hidden callbacks in Kirie and one in Capacitor.
Two focused tests cover the current callback pair and the deprecated overload.

## Initial touch focus

Reference: `Bridge.initWebView`, lines 614–616, and the loaded `CapConfig.initialFocus=true` default.
Stage-pocket has no initial-focus override in `capacitor.config.ts`.
Kirie requests touch focus during native initialization, before its initial page navigation.
This targets the native WebView. It does not focus an HTML field or open the keyboard.
The pre-change instrumentation test observed an unfocused native WebView.

## Zoom and other WebSettings defaults

Reference: `Bridge.initWebView`, lines 582–618, and `CapConfig`, lines 43–55, 287, and 306–310.
Pocket loads its configuration from assets. Its initial-focus default differs from the unrelated embedded `CapConfig.Builder` default.
The fixture compiles the full loaded configuration and extracts the original WebSettings initializer.

Pocket sets display zoom controls to false and built-in zoom controls to its configured value, which defaults to false.
Kirie now sets both to false. The platform's `supportZoom=true` remains unchanged.
The pre-change comparison failed specifically at `getDisplayZoomControls`: Pocket returned false and Kirie returned true.

The runtime differential compares 26 settings on actual WebViews with the same application target SDK.
JavaScript, DOM storage, geolocation enablement, gesture-free media, and script-created windows already match before this change.
Neither host adds wide-viewport, overview, file-access, content-access, mixed-content, text-zoom, cache, image, database, layout, or user-agent overrides.
Their platform defaults consequently match on the tested API levels.
The final default comparison also includes multiple-window support, described below.

## Multiple-window default

`Bridge.initWebView` does not enable multiple-window support.
Neither `CapacitorWebView`, `BridgeActivity`, stage-pocket's main activity, nor its Cordova wrapper enables that setting.
A new platform WebView returns `supportMultipleWindows=false` on all three tested API levels.
Kirie's earlier native navigation wrapper forced this setting to true.
That override caused `window.open` to create an unattached native popup instead of following Pocket's current-WebView behavior.

Kirie now retains the platform default. Its existing navigation policy and popup callbacks remain unchanged.
Both new tests failed before the change.
The setting comparison observed false in Pocket's initializer and true in Kirie.
The real script test observed one native popup callback instead of zero.
This change addresses the remaining setting difference without repeating the earlier navigation callback implementation.

## Packaged runtime behavior

The packaged probes use native taps on emulator-5680 with adb server 5039, Android 15, and WebView 124.0.6367.219.
Other sessions owned the default-server emulators. This task did not use emulator-5554, emulator-5556, or emulator-5558.
The probes inject controls into the running packaged pages. They do not change the shipped renderer.
Tap positions come from the native UI tree or fresh DOM rectangles mapped through the native WebView bounds.

Both apps initially report document focus with BODY as the active element. Neither app opens the keyboard.
Both geolocation probes return code 1 with `User denied Geolocation`. Neither app declares location permission.
Both photo and video capture probes fall back to Android's media picker after camera permission is granted.
The packaged manifests contain no camera query entries. The camera exists but remains invisible to the app's resolver.
Both fullscreen probes resolve their JavaScript promise and retain `document.fullscreenElement` despite the immediate native hidden callback.
The screenshot keeps the normal system bars. This Chromium behavior remains unchanged.

Actual successful photo and video acquisition cannot run through these packaged capture branches on this emulator.
The fixture exercises successful URI/result branches with real intent resolution and FileProvider output, while recording camera launches.
Real approximate and precise location grants cannot run because the packaged manifests omit location permissions.
The boundary fixture covers both grant cases on Android 11, Android 12, and Android 15.
API 26–29, API 32–34, and API 36 remain untested runtime versions.

## Checks and artifacts

The final instrumentation suite passed 20 tests on each API level: 30, 31, and 35.
The WebView versions were 83.0.4103.120, 91.0.4472.114, and 124.0.6367.219, respectively.
The suite compiles the current embedded plugin and the unchanged installed Capacitor 8.5.0 client.
The default comparison covers 26 getters.

Both APKs were built, installed, pulled, and compared byte for byte.
The generated Kirie Java equals the embedded source plus its final newline.
Compiled bytecode contains both zoom-control setters and touch focus, with no multiple-window setter.
The final APK contains no assets from the instrumentation fixture.
Its `.gdignore` prevents Godot from packaging test sources and generated test outputs.
This does not change Git ignore rules.

| Command | Result |
| --- | --- |
| Gradle 8.14.3 `assembleDebug assembleDebugAndroidTest`, with JDK 21 and `--offline` | Passed. The standalone fixture compiled. |
| `adb -P 5039 -s SERIAL shell am instrument -w ai.moeru.airi.websurfaces.test/androidx.test.runner.AndroidJUnitRunner` | Passed. Twenty tests on each owned API 30, 31, and 35 device. |
| `pnpm -F @proj-airi/stage-pocket build` | Passed. |
| `pnpm exec cap sync android` in stage-pocket | Passed. Generated tracked changes were restored after the reference APK build. |
| `./gradlew :app:assembleDebug :app:testDebugUnitTest --console=plain` in stage-pocket/android, with JDK 21 | Passed. The unit-test task was up to date. Its result file contains seven tests without failures. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie build:android` | Passed. Full web, C#, and Android build. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie exec kirie export android --build=false` | Passed. Final native export. |
| Godot 4.7.2 Mono `--headless --path apps/stage-tamagotchi-kirie --script addons/airi-android/export-plugin.gd --check-only` | Passed. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie test:unit` | Passed. Twelve files and 38 tests. The initial sandbox run blocked a browser socket. |
| `pnpm exec moeru-lint apps/stage-tamagotchi-kirie/docs/android-webview-surfaces.md apps/stage-tamagotchi-kirie/tests/android-webview-parity` | Passed. |
| `pnpm lint` | Failed. 4,808 errors and 682 warnings, including generated iOS ABI and Android build JSON. |
| `git diff --check` | Passed. |

Godot's successful export also prints its existing shutdown warning about uninitialized EditorSettings.
The initial Godot shim check failed because no global version was configured. The explicit installed Mono binary passed.

All evidence resides in `/tmp/airi-web-surfaces/`.
`source-evidence.json` records exact source paths, method lines, and SHA-256 hashes.
`artifacts.json` records built and installed APK hashes.
`kirie-compiled-plugin.txt` records exported Java bytecode.
The manifest and FileProvider dumps record the exact packaged permissions, query entries, authorities, and URI paths.
The `final-api30-tests.txt`, `final-api31-tests.txt`, and `final-api35-tests.txt` files contain the final instrumentation results.
The pre-change reports retain each failing reproduction.

`pocket-final.json` and `kirie-final.json` contain the packaged probe results.
The matching `*-geo.png`, `*-photo.png`, `*-video.png`, and `*-fullscreen.png` files show the native surfaces.
`runtime.py` and `probe.js` reproduce the probes on the owned emulator.
`runtime-windows.py` reproduces a real same-origin blank-target click in each packaged app.
The probes use untracked temporary files. The task does not edit the root `recordings-android` directory.

The blank-target runtime probes navigate the current WebView in both apps and return a window reference.
Pocket changes `https://localhost/` to `https://localhost/#surface-blank`.
Kirie changes its existing `index.html#/` URL to `index.html#/surface-blank` through its hash router.
The native setting preserves current-view navigation. The existing application origins and router modes remain unchanged.
`window-pocket.json`, `window-kirie.json`, and their PNG files record those results.

All 62 recording files present at task start retained their SHA-256 hashes.
The root directory remains untracked. No Git ignore file was edited.
