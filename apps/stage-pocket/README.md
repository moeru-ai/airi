<h1 align="center">アイリ VTuber</h1>

<p align="center">
  [<a href="https://airi.ayaka.io">Try it</a>]
</p>

> Heavily inspired by [Neuro-sama](https://www.youtube.com/@Neurosama)

## Local Hearing

Stage Pocket exposes Sherpaw models through the shared Vite plugin. The models load from pinned remote URLs when selected.
Chinese and English start with Paraformer. Other languages use an available model that supports them.

Selected remote models download into the WebView origin private file system.
Sherpaw settings show download state and let users remove stored files.
Verify origin private file system support on each target device.

## WebSocket Bridge

Stage Pocket adds a host-backed WebSocket bridge for `@proj-airi/server-sdk`.

Design constraints:
- keep page loading on secure origins (`https` or app-hosted local origins) to preserve secure-context web APIs
- only implement the WebSocket bridge needed by `@proj-airi/server-sdk`
- native owns socket I/O; `server-sdk` owns reconnect, heartbeat, authentication, and connection state
- the bridge only forwards `connect`, `send`, `close`, `open`, `message`, `error`, and `close`

## Foldable Devices

Stage Pocket selects its layout from the available width. It does not use the device type or the orientation.
Android folds and iPhone Duo use the same layout rules as other devices.

Foreground content stays inside each safe area edge separately. The insets are not symmetric on iPhone Duo. The background fills the full display.

The iOS app uses the UIScene lifecycle, which Xcode 27 requires. Scene callbacks replace the `AppDelegate` URL and foreground callbacks.
Put new URL handling or lifecycle logic in `SceneDelegate.swift`.

The SDK that builds the app controls how iPhone Duo shows it:

| Build SDK | Result on iPhone Duo |
| --- | --- |
| iOS 26 | Fixed size, centered, with empty space around the app. |
| iOS 27 | Resizes, and stops at the status bar on the inner display. |
| iOS 27.1 | Fills the display edge to edge. |

The web layout does not avoid the fold. `WKWebView` does not expose the Viewport Segments or Device Posture APIs, and safe area insets do not include the fold.
