# Remaining Android WebView surfaces

The reference is stage-pocket with Capacitor Android 8.5.0.
The starting branch is `45da0f52d25415849e4fd3ffabc23253bee9cc61`.
The differential excludes dialogs, basic picker callbacks, lifecycle, downloads, and clipboard behavior.

## Geolocation

Reference: `BridgeWebChromeClient.onGeolocationPermissionsShowPrompt`, lines 246–273, and `util/PermissionHelper.hasPermissions`, lines 29–37.
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

The runtime differential compares 25 settings on actual WebViews with the same application target SDK.
JavaScript, DOM storage, geolocation enablement, gesture-free media, and script-created windows already match before this change.
Neither host adds wide-viewport, overview, file-access, content-access, mixed-content, text-zoom, cache, image, database, layout, or user-agent overrides.
Their platform defaults consequently match on the tested API levels.
No additional setting changes are necessary for these surfaces.
The existing multiple-window routing belongs to the earlier popup alignment and remains outside this differential.
