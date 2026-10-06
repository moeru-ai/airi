# Android WebView source differential

This Android instrumentation fixture compiles the current export plugin and the installed Capacitor 8.5.0 client.
The reference client and permission helpers retain their original source.
The fixture replaces only the Activity and launcher boundaries. It does not replace WebView or WebSettings.

Run a Godot Android export first. The fixture needs the exported Godot library and Kirie's bundled Android library.
Use JDK 21, Android SDK 36, Python 3, and Gradle 8.14.3.

```sh
ANDROID_HOME="$ANDROID_SDK_ROOT" gradle --offline \
  --project-cache-dir /tmp/airi-parity-cache \
  -PparityBuildDir=/tmp/airi-parity-build assembleDebug assembleDebugAndroidTest
adb -P 5039 -s emulator-5680 install -r /tmp/airi-parity-build/outputs/apk/debug/airi-webview-parity-debug.apk
adb -P 5039 -s emulator-5680 install -r /tmp/airi-parity-build/outputs/apk/androidTest/debug/airi-webview-parity-debug-androidTest.apk
adb -P 5039 -s emulator-5680 shell am instrument -w ai.moeru.airi.websurfaces.test/androidx.test.runner.AndroidJUnitRunner
```

Select one owned device explicitly. Avoid Gradle's connected-device task on a shared adb server.
The generator rejects a Capacitor version other than 8.5.0.
The build-directory option keeps generated source and APKs outside the worktree.
Without that option, Gradle uses `build/`.

Geolocation scenarios cover granted, denied, approximate-only, empty-result, repeated-result, and overlapping requests.
The approximate-only expectation follows the device API level. Run that scenario before and after Android 12.

Capture scenarios use real camera intent resolution and the existing Godot FileProvider.
Only the fixture adds camera query entries. Production package visibility remains unchanged.
The Activity records launches instead of opening a camera application.
It also supplies denied permissions and an unwritable directory to exercise error paths.

The WebSettings reference extracts `Bridge.initWebView` through its final debugging setting.
It compiles the original `CapConfig` and loads the exact generated Pocket configuration asset.
The only initializer substitution replaces `this.config` with the local configuration variable.
The comparison covers 25 getters, including navigation, storage, file access, media, fonts, and zoom.
