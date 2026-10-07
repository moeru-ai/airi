# Android WebView behavior

The AIRI Android export plugin aligns Kirie's native WebView with stage-pocket's Capacitor host.
The shared stage-pocket renderer supplies the Android pages.

## WebSettings initialization

Kirie copies Capacitor 8.5.0's WebSettings values before it reloads the renderer.

| Setting | Value |
| --- | --- |
| Geolocation | Enabled |
| Media playback user gesture | Not required |
| Automatic JavaScript windows | Enabled |

## JavaScript dialog callbacks

Kirie copies Capacitor 8.5.0's native dialog callbacks.

| Dialog | Callback behavior |
| --- | --- |
| Alert | OK confirms. Back or outside dismissal cancels. |
| Confirm | OK confirms. Cancel, Back, or outside dismissal cancels. |
| Prompt | OK confirms trimmed input. The default value stays unused. All cancellation paths cancel. |

If the Activity finishes, Capacitor returns `true` and does not resolve the JavaScript result.
Kirie preserves this behavior.

## External navigation

Capacitor 8.5.0 supplies the reference through `BridgeWebViewClient.shouldOverrideUrlLoading` and `Bridge.launchIntent`.
These implementations reside in `@capacitor/android/capacitor/src/main/java/com/getcapacitor/`.
Stage-pocket installs that client in release builds and extends it for debug TLS handling.

Kirie routes external navigation through Android `ACTION_VIEW` intents.
This includes HTTPS links, script navigation, redirects, `mailto:`, `tel:`, and other application schemes.
If no application handles the intent, Kirie consumes the navigation and retains the renderer.
Popup navigation uses the same URL policy. Neither client checks `request.isForMainFrame()`.
The main client overrides the request callback, as Capacitor does. Popup clients retain both callback forms.

| URL or request | Behavior |
| --- | --- |
| App scheme and host (`https://res.kirie.invalid`) | Retain WebView navigation. |
| `data:` or `blob:` | Retain WebView navigation. |
| External URL in the current WebView or a popup | Open an Android application and consume WebView navigation. |
| Subframe navigation | Apply the same URL policy as main-frame navigation. |

The app comparison uses scheme and host, as Capacitor does. Capacitor does not compare ports.
Stage-pocket configures no `allowNavigation` entries, so no external host receives an allowlist exemption.
Kirie 0.8.0's `DebugTlsBypassWebViewClient` overrides asset interception and SSL error handling.
The AIRI client delegates both callbacks to that installed client.
This preserves packaged asset loading and Kirie's existing development TLS policy.
After a Kirie upgrade, examine the upstream client for additional callbacks before changing this wrapper.

## Runtime scenarios

The native regression scenarios cover external HTTPS, HTTP, email, telephone, SMS, and custom schemes.
They also cover app routes, fragments, `data:`, `blob:`, subframes, absent handlers, asset interception, and SSL callback delegation.
A real WebView script navigation must produce an external intent while retaining the app URL.
Full-app acceptance also requires a packaged page load, an Android browser handoff, and a return to the existing stage.

## File chooser accept types

Kirie mirrors Capacitor 8.5.0's `BridgeWebChromeClient.showFilePicker` and `getValidTypes`, including their failure behavior.
Conversion runs only when the accept list has multiple entries or the intent type starts with a dot.
The converted array becomes `Intent.EXTRA_MIME_TYPES`, including an empty array.
If the initial intent type starts with a dot, the first converted entry becomes the intent type.
Otherwise, the initial intent type remains unchanged.

`getValidTypes` preserves input order and does not trim values or change their case.
It converts dot-prefixed extensions with Android's `MimeTypeMap` and omits extensions without a mapping.
It preserves literal MIME values and empty strings. Duplicate converted values appear once.

| Accept value and initial intent | Result |
| --- | --- |
| `.zip` with a dot-prefixed intent type | `application/zip`, with the matching MIME extra. |
| `.vrm` with a dot-prefixed intent type | Android's mapping (`model/vrml` on Android 15), with the matching MIME extra. |
| `.vmd` with a dot-prefixed intent type | Android's mapping (`chemical/x-vmd` on Android 15), with the matching MIME extra. |
| `.json` with a dot-prefixed intent type | `application/json`, with the matching MIME extra. |
| Single `application/json` with a MIME intent type | Original intent type, without a new MIME extra. |
| Multiple known and unmapped extensions | Mapped entries only, in input order. |
| Unmapped extensions only, with a dot-prefixed intent type | `ArrayIndexOutOfBoundsException` from `validTypes[0]`. |
| Multiple unmapped extensions, with a MIME intent type | Original intent type, with an empty MIME extra. |
| Single empty accept value or wildcard, with a MIME intent type | Original intent, without conversion. |

The intent retains the original chooser action, openable category, and multiple-selection mode.
Pending callback replacement, cancellation, and activity-result handling remain with the export plugin.
The unmapped extension failure occurs before activity launch and its `ActivityNotFoundException` handler.
This failure is intentional parity with stage-pocket, as required by the task.

The native scenarios cover ZIP, JSON, VRM, VMD, duplicates, case, whitespace, empty values, wildcards, and multiple selection.
They also cover omitted unmapped extensions, empty MIME extras, and the extension-only failure.
Full-app acceptance also requires selection, cancellation, and import of real files through Android's document provider.

## File chooser callback lifecycle

Kirie retains one mutable file chooser callback, as Capacitor 8.5.0 retains one mutable activity-result listener.
A later chooser replaces the callback without resolving the earlier callback.
The selected callback remains after a result, a launch failure, and host destruction.
An activity recreation creates a new host without the old callback, so the returning result is lost.
Kirie does not send a cancellation result during destruction.
These behaviors include Capacitor's existing callback loss and retention bugs.

The runtime scenarios start overlapping choosers, return repeated results, fail an intent launch, and recreate the activity during selection.
The active callback receives each delivered result until another chooser replaces it.
The superseded callback receives no value.
After recreation, neither the old page nor the new page receives the pending chooser result.

A `RESULT_OK` callback with a null intent throws `NullPointerException`, as Capacitor 8.5.0 does.
Cancellation and other result codes pass the nullable intent to `FileChooserParams.parseResult`.

## Notification alarms

Kirie copies Capacitor Local Notifications 8.3.1 for the notification page's default one-time schedule.
It uses an exact non-wakeup alarm when Android permits exact alarms.
Without that permission, the Send Notification click opens Android's alarm settings.
When the user returns, it uses an exact alarm if granted and a non-exact alarm otherwise.
The default notification channel uses Pocket's `Default` name and description.
Kirie creates this channel during Android host startup, before the first notification is delivered.
Kirie persists pending notifications and restores them after the user unlocks a restarted device.
It restores a one-time notification only when its trigger remains in the future.
It keeps Pocket's bug that skips a missed one-time notification instead of scheduling its 15-second catch-up.
When Android notifications are disabled, scheduling rejects before the exact-alarm settings flow.

## Android backup persistence

Kirie enables Android application backup in every build variant, matching stage-pocket's manifest.
Android backup and restore therefore include eligible WebView storage under the same platform rules.

The runtime scenario writes renderer state, performs an Android backup and restore, then verifies the restored value.

## Launcher task reuse

Kirie exports its main Android activity with `singleTask`, matching stage-pocket's `MainActivity`.
Repeated launcher intents reuse the existing task and deliver the new intent to its main activity.

The runtime scenario launches the activity twice and verifies one task and one main activity instance.

## Activity recreation

Kirie omits `layoutDirection` from the main activity's handled configuration changes, matching stage-pocket.
Android recreates the activity for a layout-direction-only configuration change.
Kirie restarts Godot during this recreation so the replacement activity renders the shared stage.

The runtime scenario changes only layout direction and verifies activity destruction, process rebirth, and a rendered replacement.

## Right-to-left layouts

Kirie declares right-to-left layout support in every build variant, matching stage-pocket's manifest.
Android can therefore apply a right-to-left layout direction and trigger the matching recreation path.

The runtime scenario changes to a right-to-left locale and verifies the application layout direction.

## Keyboard viewport

Android reports the navigation bar inside the IME bottom inset.
Kirie subtracts that existing navigation-bar inset before resizing its WebView, matching Pocket's `adjustResize` content height.

## Keyboard verification on 2026-10-07

Pocket and Kirie ran on the same Android 15 emulator with the same screen, animation, and keyboard settings.
Both WebViews measured 876 CSS pixels before opening the keyboard.
Both measured 564 CSS pixels after tapping the message composer.
Their visual viewports both measured 564.19049 CSS pixels.

The raw recordings are `stage-pocket-keyboard-navigation-inset.mp4` and `stage-tamagotchi-kirie-keyboard-navigation-inset.mp4`.
The event-aligned comparison is `compare-keyboard-navigation-inset-timeline.mp4`.
All three files remain untracked under `recordings-android`.

## Mobile composer action verification on 2026-10-07

Pocket and Kirie ran from commit `0ba436cd2` on the same Android 16 emulator.
The emulator used API 36, WebView 133.0.6943.137, KVM, and host GPU rendering.
Both WebViews measured 412 × 839 CSS pixels at a device pixel ratio of 2.625.

Each application started with the voice-input action beside an empty composer.
Native taps focused the composer, entered `parity`, and pressed the resulting send action.
Both applications opened the same keyboard, changed the action to send, closed the keyboard, and retained the draft without a configured provider.
The aligned keyboard transitions differ by no more than one 30 FPS frame.

The Pocket APK SHA-256 is `720df8f2a96f3862755b1dbaedb8cfc990d305cb9d2d20205051c8a5c02a2f48`.
The Kirie APK SHA-256 is `c7131b5e6828fa791b896576872e71c99e6f286b3c97bd3c11e1ce0496a31410`.
The raw recording hashes are `72b65a8044f3e7c06dcac54aee895477f2dcdd396bb1c2c11bc172a066271f89` and `fc6abc4c0c2783c355d9d54e8b1ccb898ddbb2a1af6418a8cd747efbdeebe475`.
The aligned comparison hash is `7f43ed3d0cba693e034e2bdb318b4b3dda2a6b4b59fbec9099e883f4151a7a2d`.

The evidence directory is `recordings-android/input-action-button-0ba436cd2-2026-10-07/`.
It contains both raw recordings, trimmed recordings, contact sheets, and the side-by-side comparison.
All evidence files remain untracked, and no ignore rule changed.

## Verification on 2026-10-06

A temporary Android instrumentation project compiles the Java source extracted from `ANDROID_PLUGIN_SOURCE`.
The project uses the existing Godot Android library and the export plugin's native dependencies.
Its picker reference comes directly from the installed Capacitor 8.5.0 source.
Intent launches use a recording Activity. The scenarios do not launch external applications or import model files.
Sixteen native tests passed on Android 15, including both popup callbacks and the expected unmapped extension failure.
The main client's inherited deprecated callback also matches Capacitor.
The `getValidTypes` method matches the Capacitor source verbatim.
The original keyboard methods came from `cc2fbda9f`.

| Command | Result |
| --- | --- |
| `gradle --offline --console=plain connectedDebugAndroidTest` in the temporary project | Passed. Native debug and instrumentation APKs compiled. Sixteen tests passed. |
| `godot --headless --path . --script addons/airi-android/export-plugin.gd --check-only --log-file /private/tmp/airi-android-alignment/parity-godot.log` | Passed with Godot 4.7.2 Mono. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed using the existing generated workspace declarations in this worktree. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie exec vitest run --config vitest.config.ts --project browser src-web/src/renderer/host-context/external-navigation.browser.test.ts` | Passed. Three browser tests passed. |
| `pnpm lint` | Passed with existing warnings. The linter does not parse GDScript or its embedded Java. |
| `git diff --check` | Passed. |

Full Godot export, external application handoff, document-provider selection, and model import remain runtime acceptance scenarios.
