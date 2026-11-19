# Kirie host architecture

[README](../README.md) owns setup, scope, and current limitations.

## Runtime boundaries

| Owner | Responsibility |
| --- | --- |
| AIRI renderer | Vue pages, host adapters, routes, and AIRI Eventa contracts |
| Kirie Core | WebView lifecycle and IPC transport |
| Kirie Platform | Window operations, global shortcuts, external URLs, and the application data directory |
| Kirie Notifications | System notifications and activation events |
| Kirie Tray | Native tray icon, menus, and tray events |
| AIRI Godot services | Application windows, the tray menu, authentication, microphone policy, and service attachments |

The renderer has one Eventa transport owner. Capability clients borrow its context.
[Platform](https://github.com/gd-kirie/gd-kirie/blob/v0.14.2/packages/platform/README.md) and [Notifications](https://github.com/gd-kirie/kirie-plugins/blob/main/packages/notifications/README.md) document the upstream capability APIs.

Kirie-local adapters always use Kirie.
Shared UI retains `RUNTIME_ENVIRONMENT='electron'` and Electron-named Eventa IDs as existing selectors and contracts.
Those names do not select an Electron transport.
The Electron application and `engines/stage-tamagotchi-godot/` remain separate supported paths.

## Source map

| Path | Responsibility |
| --- | --- |
| [src-web/src/renderer](../src-web/src/renderer) | Renderer entry points, routes, and host adapters |
| [src-web/src/shared](../src-web/src/shared) | AIRI Eventa contracts |
| [src-godot/scripts](../src-godot/scripts) | C# services, window managers, permissions, and authentication |
| [src-godot](../src-godot) | Native scenes |
| [kirie.config.ts](../kirie.config.ts) | Web build, aliases, routes, and enabled capability plugins |
| [tests/StageTamagotchiKirie.Tests](../tests/StageTamagotchiKirie.Tests) | C# contract checks |

The production Web entry is `res://src-web/dist/index.html`.

## Window and context lifecycle

Main receives `synced-leader=true` before Pinia initialization. Followers receive `synced-leader=false`.
About, Chat, and Spotlight use `stage-runtime=minimal`.
Pointer, display, window-action, and lifecycle adapters borrow the same host context.
Display placement uses one atomic snapshot. Kirie's pointer-inside result overrides stale renderer bounds.

Godot owns resize, movement, close requests, and child cleanup.
Window managers own reuse, keyed Devtools lookup, route requests, and service attachments.
Settings retains its latest route before readiness.
Notice resolves once, with `true` for confirmation and `false` for cancellation or close.
Transparency requires alpha in the CEF background, root viewport, and each native window.

Godot exits children before parents. Manager `TreeExiting` callbacks clear child references before Main disposes services.
Caller-owned registrations and capability hosts end before their Eventa context.
Main registers Notifications contracts in the shared JSON registry before any window creates its context.
Main and Spotlight attach their own Notifications hosts.
Readiness, focus grace periods, cancellation, and completion guards retain distinct meanings.
See [Godot lifecycle](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/node.cpp).

## Tray

Godot owns the tray through the `GdKirie.Tray` C# API. The tray stays usable while the main renderer reloads.
The menu follows the [Electron tray](../../stage-tamagotchi/src/main/tray/index.ts).
Godot applies the size and alignment items to the main window directly. Alignment animates with a Godot `Tween`.
The checked size and alignment items follow the main-window geometry on each frame.
Kirie has no Inlay, Widgets list, Caption, or BeatSync window. Their items stay disabled.
The DevTools section appears only in debug builds.

The main renderer owns translations. It sends all labels through `eventa:invoke:airi:tray:labels:set` at start and after each locale change.
Godot shows English labels until the first labels arrive.
A left click shows the main window on Windows. On macOS, a left click opens the menu and a double click shows the main window.
If the platform has no tray, Main logs the error and continues. Main still answers the label invoke, because an unanswered invoke never settles.

## Spotlight and permissions

AIRI owns Spotlight's reusable native window, contracts, and `user://spotlight.cfg`.
Its shortcut registration is separate from renderer-owned registrations. Renderer `unregisterAll` must not release Spotlight.
Close and blur hide Spotlight. Notification activation opens Chat.
Notifications use the caller's context, and activation returns only to that context.
`beforeunload` releases the shortcut registration during CEF reload. CEF focus requires `FocusMode` and `GrabFocus()`.

AIRI owns microphone state in `user://permissions.cfg`.
Only the exact main-renderer origin can capture audio. Other origins, windows, and permission types receive denial.
The CEF `Signal` policy groups native request IDs behind one opaque prompt ID.
Denial, modal close, the two-minute timeout, and shutdown deny pending requests.
Every window that awaits permission state needs `MicrophonePermissionService.Attach`. Only Main owns permission prompts.
An explicit enable-button click resets stored denial. Automatic requests retain denial.
See the [CEF permission API](https://github.com/dsh0416/godot-cef/blob/v2.0.0/docs/api/methods.md#permission-handling).

## Authentication and desktop services

AIRI owns system-browser OIDC with PKCE, state checks, and a temporary loopback listener.
The renderer supplies the server URL and client ID before login. Logout cancels unfinished login.
See [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html).

External HTTP(S) requests use Platform `openExternalUrl()`. AIRI rejects other schemes.
Disposal restores `window.open` and removes the click handler.
The data-directory API accepts no caller path. Godot selects its application directory and propagates OS errors.

Inspector selection requires the leader target and a usable `devtoolsFrontendUrl`, irrespective of target order.
Production disables remote debugging. The shared CEF context preserves cookies, storage, BroadcastChannel, and Web Locks across windows.
Tool reruns use the shared `invocationId` to distinguish repeated `toolCallId` values.
The [shared rerun implementation](../../../packages/stage-ui/src/stores/tool-call-rerun.ts) owns target rejection, result replacement, and dependent continuation invalidation.
