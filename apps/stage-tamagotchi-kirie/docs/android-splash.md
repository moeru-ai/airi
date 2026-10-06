# Android native splash alignment

The native cold-start splash matches stage-pocket. Both applications support Android API 26 and later and target API 36.

## Source and export

The AIRI Android export plugin copies stage-pocket's 34 launch resources into the generated Gradle project.
These resources include every portrait and landscape splash density, launcher density, adaptive launcher XML, and launcher background color.
The source remains `apps/stage-pocket/android/app/src/main/res`. No second asset set requires maintenance.

`AiriAppSplashTheme` uses the same `Theme.SplashScreen` parent and `android:background` as stage-pocket's `AppTheme.NoActionBarLaunch`.
Both builds resolve `androidx.core:core-splashscreen:1.2.0`.
The AndroidX versioned themes determine the native background, system bars, contrast, and light or dark appearance.
The splash has no fixed AIRI background color or app-specific night override.

| Android version | Native launch behavior |
| --- | --- |
| API 26–30 | The checked-in Capacitor splash remains white in both system modes. Portrait, landscape, and density qualifiers select the same PNG. |
| API 31 and later | Android uses the adaptive launcher icon and the system theme background. AndroidX supplies the versioned day/night defaults. |

Kirie assigns stage-pocket's launcher icon to its application, activity, and launcher alias.
The application also uses `@mipmap/ic_launcher_round`, as stage-pocket does.
An explicit `android:windowSplashScreenAnimatedIcon` changes Android's icon sizing, so the launch theme leaves that attribute inherited.
The copied adaptive icon keeps stage-pocket's white background and foreground image in both modes.

Kirie switches the application and activity to `AiriAppMainTheme` during `onCreate`, as Capacitor switches both to `AppTheme.NoActionBar`.
The main theme clears `android:background`. Its window background uses the existing AIRI day/night surface color.
Kirie does not install an AndroidX splash or retain it until the Godot main loop starts.
Android removes the starting window when the application draws, with no extra application timer or keep-on-screen condition.
Godot's export process regenerates its own splash theme and debug application icon.
The plugin selects an application-owned launch theme and Pocket icons in the main manifest.
Variant manifests override the generated application icon for standard, Mono, and instrumented builds in debug and release modes.
Their higher merge priority preserves the Pocket icon after Godot regenerates the build-type manifests.
See [Android manifest merge priorities](https://developer.android.com/build/manage-manifests#merge-priorities).

This alignment covers native assets, theme selection, and the application-controlled splash lifecycle.
Elapsed native splash duration still depends on the first application draw. Godot and Capacitor reach that draw at different times.
Godot startup, WebView startup, and first-page rendering remain separate runtime behavior.

## Build and inspect

From the repository root, build Kirie:

```sh
pnpm -F @proj-airi/stage-tamagotchi-kirie build:android
```

For a fresh stage-pocket reference, build and sync its web assets before the Gradle build:

```sh
pnpm -F @proj-airi/stage-pocket build
cd apps/stage-pocket
pnpm exec cap sync android
cd android
./gradlew :app:assembleDebug :app:testDebugUnitTest --console=plain
```

Gradle requires Java 21 and the Android SDK. The Kirie README describes addon and Godot template installation.
Capacitor sync can regenerate tracked Gradle files. Keep generated path changes outside the splash commit.

With the Android SDK build-tools directory on `PATH`, inspect both APKs:

```sh
aapt2 dump resources apps/stage-pocket/android/app/build/outputs/apk/debug/app-debug.apk
aapt2 dump resources apps/stage-tamagotchi-kirie/dist/kirie/android/debug.apk
aapt2 dump xmltree apps/stage-tamagotchi-kirie/dist/kirie/android/debug.apk --file AndroidManifest.xml
apksigner verify apps/stage-tamagotchi-kirie/dist/kirie/android/debug.apk
```

Compare the `Theme.SplashScreen` parent chain across all API and night qualifiers. APK resource IDs differ between applications.
Compare the packaged splash and launcher PNG bytes. Inspect the adaptive icon XML and its background color references.
In the packaged Kirie manifest, the application, `GodotApp`, and `GodotAppLauncher` use `@mipmap/ic_launcher`.
The application uses `@mipmap/ic_launcher_round` as its round icon. Inspect the packaged manifest, not only the generated source manifest.
The activity uses `AiriAppSplashTheme`.
Inspect the compiled `GodotApp.onCreate` for both main-theme assignments.
It must contain no `SplashScreen.installSplashScreen` or `setKeepOnScreenCondition` calls.

## Regression evidence

The installed stage-pocket APK on `emulator-5554` matched the current built APK byte for byte.
Its SHA-256 was `d07a354d76968b850e22b1b01bd80c0c106155d9c7e6e1fbc681e0f91d9444e0`.
The device ran API 35. The installed Kirie APK also matched its current build.

The supplied recordings showed the pink circular character in both applications at 1.20 seconds.
Kirie then exposed the white Capacitor splash with a blue icon at 1.70 and 3.00 seconds.
The earlier verification missed this transition because it inspected only the initial system splash.
The activity-theme handoff clears that retained launch background. Removing Godot's keep-on-screen condition matches Capacitor's native lifecycle.

A follow-up review found `@mipmap/icon` on the application despite the aligned activity and alias icons.
The main manifest now selects Pocket's application and round icons. Variant overlays preserve them after Godot regenerates its build-type manifests.
All six merged variant manifests selected the expected application and round icons.
The supplied `/tmp/airi-splash-frames/kirie-1.6.png` showed the blue Capacitor symbol.
The fresh light-mode capture at 1.6 seconds showed the black Godot surface with no retained symbol.

A fresh export recreated the Android template before the complete Android build.
The revised installed APK matched the built APK with SHA-256 `457c400610ed3d5b3193dffe8d4a48f105986fc8d96e6803b976606b8d95914e`.
All 34 source resources and packaged PNGs matched. Nine compiled AndroidX theme chains matched across their API and night qualifiers.
Compiled `GodotApp.onCreate` switched both themes and contained no splash-install or keep-on-screen calls.

At 720×1280, both native icons had pink-content bounds `(252, 530)` through `(469, 751)`.
Both recorded backgrounds were RGB `(240, 239, 244)` in light mode and `(25, 27, 31)` in dark mode.
These RGB values describe decoded video pixels. Packaged resources establish the original color and asset identity.

| API 35 capture | First native frame | Last native frame | First application frame |
| --- | --- | --- | --- |
| Pocket, light | 0.970167 s | 2.920244 s | 2.934722 s |
| Kirie, light | 0.995000 s | 1.510678 s | 1.527433 s |
| Pocket, dark | 0.995933 s | 1.510367 s | 1.527778 s |
| Kirie, dark | 0.978867 s | 1.444622 s | 1.461111 s |

Each capture reported `LaunchState: COLD`. Kirie's first application frame was the black Godot surface.
The web content appeared at 11.310256 seconds in light mode and 10.510711 seconds in dark mode.
No retained Capacitor symbol appeared between the native splash and web content.

API 30 captures showed the same white native PNG in both system modes.
The API 30 emulator crashed afterward with `SIGSEGV` in Godot's `VkThread`.
The original installed Kirie APK reproduced the same crash at the same native program counters.
The API 30 check establishes native splash appearance, not successful application startup.

## Deterministic cold-start recording

1. Use the same emulator, API, resolution, density, navigation mode, and orientation for both applications.
2. Install both APKs from the same source revision. Use the same initial application data for each repeat.
3. Record API 30 and API 31 or later. Repeat each comparison in light and dark system modes.
4. Save the current rotation, animation, and night-mode settings before the comparison.
5. Disable all three animation scales. Lock auto-rotation and set `user_rotation` to `0` for portrait or `1` for landscape.
6. Set the system mode with `adb shell cmd uimode night no` or `adb shell cmd uimode night yes`.
7. Force-stop the application. Return to Home and wait one second before the recording.
8. Start `screenrecord` before the launch. Use the same explicit recording size and capture through the first web content.
9. Start the launcher component with `am start -W`. Require `LaunchState: COLD` in its output.
10. Restore the saved device settings after both captures.

| Application | Package | Launcher component |
| --- | --- | --- |
| stage-pocket | `ai.moeru.airi_pocket` | `ai.moeru.airi_pocket/.MainActivity` |
| Kirie | `ai.moeru.airi.kirie` | `ai.moeru.airi.kirie/com.godot.game.GodotAppLauncher` |

For each application, use two terminals. Replace the serial, package, component, and capture name with the selected values.

Prepare the application in the first terminal:

```sh
adb -s SERIAL shell am force-stop PACKAGE
adb -s SERIAL shell input keyevent KEYCODE_HOME
```

After one second, start the recording in the second terminal:

```sh
adb -s SERIAL shell screenrecord --size 720x1280 --time-limit 12 /data/local/tmp/airi-splash.mp4
```

After one second, launch the application in the first terminal:

```sh
adb -s SERIAL shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n COMPONENT
```

After the recording finishes, copy it to a temporary directory:

```sh
adb -s SERIAL pull /data/local/tmp/airi-splash.mp4 /tmp/CAPTURE.mp4
adb -s SERIAL shell rm /data/local/tmp/airi-splash.mp4
ffmpeg -i /tmp/CAPTURE.mp4 -vsync 0 /tmp/CAPTURE-%04d.png
```

Inspect every frame from the first native splash through the application surface.
On API 31 and later, no blue Capacitor icon can remain after the pink system icon disappears.
Align captures by the first native splash frame. Record the first and last native frame timestamps separately.
Compare background color, icon bounds, icon content, and system bars. Exclude the changing clock from image comparisons.
Screenrecord emits variable-rate frames. A static final surface can produce no additional frames before the recording stops.
Capture a final `adb exec-out screencap -p` image to verify that surface.
Video compression prevents byte-exact frame comparisons. Packaged PNG comparisons establish asset identity.
Force-stop establishes a cold process start. It does not clear disk caches or application data.

All comparison output belongs outside `recordings-android`. This procedure does not edit that directory or add an ignore rule.
