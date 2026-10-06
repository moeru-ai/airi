# Android WebView behavior

The AIRI Android export plugin aligns Kirie's native WebView with stage-pocket's Capacitor host.
The shared stage-pocket renderer supplies the Android pages.

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
