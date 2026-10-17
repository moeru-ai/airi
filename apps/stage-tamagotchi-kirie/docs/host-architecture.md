# Kirie host architecture

[Migration status](../MIGRATION.md) owns acceptance and deferred work.
[README](../README.md) owns setup. [Ablation review](ablation-review.md) owns framework simplification decisions.

## Runtime and ownership

```text
Vue renderer -> AIRI Eventa contracts
             -> Kirie Platform and IPC -> Godot and operating-system APIs
             -> AIRI Godot handlers -> application windows and services
```

| Owner | Responsibility |
| --- | --- |
| AIRI Kirie application | Renderer integration, native application windows, authentication, and permissions |
| Kirie Core | WebView lifecycle and IPC transport |
| Kirie Platform | General desktop capabilities |
| Electron application | Supported application and behavior reference |
| AIRI Node services | Deferred server channel, plugins, Artistry, and MCP |

The Kirie renderer uses one Kirie host adapter.
Its owner supplies the required Platform client and one Eventa context per renderer.
Kirie-local adapters do not select an Electron transport at runtime.
The original Electron application and `engines/stage-tamagotchi-godot/` remain separate supported paths.

Deferred Node services do not start in the Kirie renderer bootstrap.
Their visible pages remain outside supported capability until AIRI supplies the runtime and lifecycle.
A rejected operation does not establish an implementation.

## Source map

| Path | Responsibility |
| --- | --- |
| [src-web/src/renderer](../src-web/src/renderer) | Renderer, host adapters, routes, and entry points |
| [src-web/src/shared](../src-web/src/shared) | AIRI Eventa contracts |
| [src-godot/scripts](../src-godot/scripts) | C# services, managers, permissions, and authentication |
| [src-godot](../src-godot) | Native scenes |
| `addons/kirie/` | Installed addon and CEF metadata from the [official release](https://github.com/moeru-ai/godot-kirie/releases/tag/v0.10.0) |
| [tests/StageTamagotchiKirie.Tests](../tests/StageTamagotchiKirie.Tests) | C# contract checks |
| [kirie.config.ts](../kirie.config.ts) | Web build, aliases, and route selection |

The production Web entry is `res://src-web/dist/index.html`.
The [C# development method](../../../engines/stage-tamagotchi-godot/docs/csharp-development-method.md) and [style guide](../../../engines/stage-tamagotchi-godot/docs/csharp-style.md) remain canonical.

## Required behavior

### Window and context lifecycle

Main receives `synced-leader=true` before Pinia initialization. Followers receive `synced-leader=false`.
Chat and Spotlight use `stage-runtime=minimal`.
Pointer, display, window-action, and lifecycle adapters borrow the same host context.
Display placement uses one atomic snapshot. Kirie's pointer-inside result overrides stale renderer bounds.

Godot owns resize, movement, close requests, and child cleanup.
Managers own window reuse, keyed Devtools lookup, route requests, and service attachments.
Settings retains its latest route before readiness.
Notice resolves once, with `true` for confirmation and `false` for cancellation or close.
These requirements do not justify a generic manager for all window types.

Godot exits children before parents. Manager `TreeExiting` callbacks clear child references before Main disposes services.
Caller-owned Eventa registrations end before their context or service.
Readiness, focus grace periods, cancellation, and completion guards retain distinct meanings.
See [Godot lifecycle](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/main/node.cpp) and [Window](https://docs.godotengine.org/en/4.7/classes/class_window.html).

Transparency requires alpha in the CEF background, root viewport, and each native window.
The quit adapter retains its no-argument caller API and sends an explicit empty host payload.

### Spotlight and permissions

AIRI owns Spotlight's reusable native window, contracts, and `user://spotlight.cfg`.
Its shortcut registration is separate from renderer-owned registrations. Renderer `unregisterAll` must not release Spotlight.
Close and blur hide Spotlight. Notifications open Chat.
`beforeunload` releases the shortcut registration during CEF reload.
CEF `FocusMode` and `GrabFocus()` remain necessary.

AIRI owns microphone state in `user://permissions.cfg`.
Only the exact main-renderer origin can capture audio. Other origins, windows, and permission types receive denial.
The CEF `Signal` policy groups native request IDs behind one opaque prompt ID.
Denial, modal close, the two-minute timeout, and shutdown deny pending requests.
See the [CEF permission API](https://github.com/dsh0416/godot-cef/blob/v1.16.1/docs/api/methods.md#permission-handling).

Every window that awaits permission state requires AIRI handlers.
`MicrophonePermissionService.Attach` supplies them, while only Main owns prompts.
An explicit enable-button click resets stored denial. Automatic requests retain denial.
The original Chat stall resulted from a missing handler before `chatStore.initialize()`.
The upstream default-rejection proposal [kirie#87](https://github.com/moeru-ai/godot-kirie/pull/87) closed without merge.

### Authentication and desktop services

AIRI owns system-browser OIDC with PKCE, state validation, and a temporary loopback listener.
The renderer supplies the server URL and client ID before login. Logout cancels unfinished login.
See [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html).

External HTTP(S) requests use Platform `openExternalUrl()`.
AIRI rejects other schemes. Platform validates the absolute URL before `OS.shell_open()`.
Disposal restores `window.open` and removes the click handler.
The data-directory API accepts no caller path. Godot selects `OS.get_user_data_dir()` and propagates OS errors.

Inspector selection requires the leader target and a usable `devtoolsFrontendUrl`, irrespective of target order.
Production disables remote debugging. See the [CEF security baseline](https://github.com/dsh0416/godot-cef/blob/v1.16.1/docs/api/security-baseline.md).
A route-keyed boundary isolates renderer errors.
The shared CEF context preserves cookies, storage, BroadcastChannel, and Web Locks across windows.

Tool reruns forward the shared `invocationId` to select one invocation among repeated `toolCallId` values.
The [shared rerun implementation](../../../packages/stage-ui/src/stores/tool-call-rerun.ts) owns target rejection, result replacement, and dependent continuation invalidation.

## Native widgets

`WidgetWindowManager` owns widget snapshots, reserved IDs, expiry times, and native window instances.
`WidgetWindow` owns one window's Kirie transport, Platform binding, permissions, and teardown.
`WidgetContracts` defines the matching JSON payloads and Eventa names.

The renderer fetch supplies initial state. Mutation events start after that renderer fetches its own widget.
Closing uses a one-way event, so the renderer does not wait for a response from the transport it closes.
Expiry uses Godot's monotonic clock and runs on the main thread.
A partial update preserves its expiry unless `ttlMs` is present.

## Local chat and voice

The main renderer uses the shared context bridge's local runtime to publish turns and receive remote streams.
The minimal Chat renderer uses its passive stream view. Both dispose their bridge with their application scope.
No server consumer registrations occur in local mode.
The stage supplies built-in tool references to the voice host.
Push to Talk binds the native global keyboard service only while its input mode and microphone preference are active.


### Native floating Chat

`ChatWindowManager` owns saved style preferences, folded state, pin policy, and attached geometry.
`ChatWindowContracts` supplies typed preferences and state over Eventa.
The renderer fetches initial state before showing content and subscribes to later changes.
Fold completes its renderer transition before the native host hides the window.
A hidden Chat keeps its CEF context and composer. Style changes also reuse this context.
The main window's chat button reads the same host state.


### Native voice inlay

`InlayWindowHost` owns one transparent, pinned minimal follower window and its typed Eventa bindings.
The shared `VoiceInlay` component consumes the real speech bus. Each desktop wrapper supplies native window behavior.
The stage opens this window at startup, on capture, and when an editable draft appears.
Idle content returns home after five seconds. A changed primary work area also returns the window home.

On macOS, the AIRI-specific Escape observer uses CoreGraphics with `listenOnly` and its own Core Foundation loop.
It observes only while speech or editable drafts are visible. It retains an Escape flag, not keyboard text.
Godot's main thread consumes that flag and emits the typed Eventa notification.
Disposal stops and joins the observer loop before releasing its native resources.
Windows uses Kirie's published non-consuming keyboard driver. Local Escape works on both platforms without a global observer.

The [Apple API](https://developer.apple.com/documentation/coregraphics/cgeventtapoptions/listenonly) defines passive listening.
The pinned [Kirie macOS backend](https://github.com/moeru-ai/godot-kirie/blob/v0.10.0/packages/GdKirie.Platform/src/GlobalShortcuts/MacOsGlobalShortcutBackend.cs) registers Carbon hotkeys.
The inlay uses passive observation so the foreground application also receives Escape.
