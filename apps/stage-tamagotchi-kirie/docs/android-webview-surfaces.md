# Remaining Android WebView surfaces

The reference is stage-pocket with Capacitor Android 8.5.0.
The starting branch is `45da0f52d25415849e4fd3ffabc23253bee9cc61`.
The differential excludes dialogs, basic picker callbacks, lifecycle, downloads, and clipboard behavior.

## Geolocation

Reference: `BridgeWebChromeClient.onGeolocationPermissionsShowPrompt`, lines 226–263, and `util/PermissionHelper.hasPermissions`, lines 29–37.
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
