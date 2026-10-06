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

## Verification on 2026-10-06

A temporary Android instrumentation project compiles the Java source extracted from `ANDROID_PLUGIN_SOURCE`.
The project uses the existing Godot Android library and the export plugin's native dependencies.
Its picker reference comes directly from the installed Capacitor 8.5.0 source.
Intent launches use a recording Activity. The scenarios do not launch external applications or import model files.
Sixteen native tests passed on Android 15, including both popup callbacks and the expected unmapped extension failure.
The main client's inherited deprecated callback also matches Capacitor.
The `getValidTypes` method matches the Capacitor source verbatim.
The keyboard methods from `cc2fbda9f` remain unchanged.

| Command | Result |
| --- | --- |
| `gradle --offline --console=plain connectedDebugAndroidTest` in the temporary project | Passed. Native debug and instrumentation APKs compiled. Sixteen tests passed. |
| `godot --headless --path . --script addons/airi-android/export-plugin.gd --check-only --log-file /private/tmp/airi-android-alignment/parity-godot.log` | Passed with Godot 4.7.2 Mono. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie typecheck` | Passed using the existing generated workspace declarations in this worktree. |
| `pnpm -F @proj-airi/stage-tamagotchi-kirie exec vitest run --config vitest.config.ts --project browser src-web/src/renderer/host-context/external-navigation.browser.test.ts` | Passed. Three browser tests passed. |
| `pnpm lint` | Passed with existing warnings. The linter does not parse GDScript or its embedded Java. |
| `git diff --check` | Passed. |

Full Godot export, external application handoff, document-provider selection, and model import remain runtime acceptance scenarios.
