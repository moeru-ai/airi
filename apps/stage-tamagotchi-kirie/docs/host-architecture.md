# Kirie host architecture

This document records runtime ownership and implementation constraints.
[Migration status](../MIGRATION.md) owns scope, acceptance decisions, and open failures.
[README](../README.md) owns setup and commands.

## Runtime ownership

```text
Stage Tamagotchi Vue renderer
  -> AIRI host contracts
  -> @gd-kirie/platform and @gd-kirie/ipc-eventa
  -> Kirie IPC
  -> GdKirie.Platform and AIRI Godot handlers
  -> Godot and operating-system APIs
```

| Owner | Responsibility |
| --- | --- |
| AIRI Kirie application | Renderer integration, native application windows, authentication, permissions, and business services |
| Kirie Core | WebView lifecycle and IPC transport |
| Kirie Platform | General desktop capabilities through Godot and operating-system APIs |
| Electron application | Supported application and behavior reference |
| AIRI sidecar | Deferred Node.js services and their process lifecycle |

`apps/stage-tamagotchi-kirie/` remains the final Kirie application directory.
The renderer reference is `apps/stage-tamagotchi/src/renderer/`, with contracts under its `src/shared/`.
`engines/stage-tamagotchi-godot/` remains a separate runtime.
The production Web entry is `res://src-web/dist/index.html`.

## Source map

| Path | Responsibility |
| --- | --- |
| [src-web/src/renderer](../src-web/src/renderer) | Vue renderer, host context, adapters, routes, and application entry points |
| [src-web/src/shared](../src-web/src/shared) | AIRI Eventa contracts shared by renderer entry points |
| [src-godot/scripts](../src-godot/scripts) | C# application services, window managers, permissions, and authentication |
| [src-godot](../src-godot) | Native window scenes and the main scene |
| [addons/kirie](../addons/kirie) | Published Kirie addon and CEF artifact metadata |
| [tests/StageTamagotchiKirie.Tests](../tests/StageTamagotchiKirie.Tests) | C# contract and runtime checks |
| [kirie.config.ts](../kirie.config.ts) | Web build, shared-package aliases, and route selection |

The [C# development method](../../../engines/stage-tamagotchi-godot/docs/csharp-development-method.md) remains the canonical C# guidance.
The [C# style guide](../../../engines/stage-tamagotchi-godot/docs/csharp-style.md) and local editor configuration define formatting and naming.

## Implementation constraints

These constraints preserve the reasons for earlier fixes. The capability matrix owns their current acceptance status.

### Shared contexts and native windows

The main renderer receives `synced-leader=true` before Pinia initialization.
Secondary windows receive `synced-leader=false`.
Chat and Spotlight use `stage-runtime=minimal`.

Pointer, display, window-action, and lifecycle adapters borrow the shared host context.
Display placement uses one atomic current-display snapshot.
Godot owns edge detection, native resize, movement, and close requests.
Kirie supplies the authoritative pointer-inside result. Cached renderer bounds do not override it because they can lag after a resize.

Onboarding, Settings, and Chat reuse their existing window on repeated requests.
If requests arrive before renderer readiness, Settings also applies the latest requested route.
Notice requests resolve `true` on confirmation and `false` on cancellation or close.
The quit adapter preserves Electron's no-argument API and sends an explicit empty payload to Godot.

Transparency requires the CEF background, root viewport, and native window to preserve alpha.
Auxiliary transparent windows require their own settings.
See [Godot Window](https://docs.godotengine.org/en/4.7/classes/class_window.html)
and [transparency settings](https://docs.godotengine.org/en/4.7/classes/class_projectsettings.html#class-projectsettings-property-display-window-per-pixel-transparency-allowed).

### Spotlight ownership and reload

AIRI owns the native window, shortcut persistence in `user://spotlight.cfg`, and Eventa contracts.
The main renderer registers the OS shortcut through Kirie Platform, outside the renderer-owned GAP-008 registration map.
Renderer `unregisterAll` must not release Spotlight.

Spotlight reuses one borderless, always-on-top window. Close and blur hide it without destruction.
Its renderer shows result notifications. Notification activation opens Chat.
This orchestration does not require a Kirie Core API.

The original reload defect left native registration callbacks attached to an unloaded page.
CEF emitted `beforeunload`, but not `pagehide`, `unload`, or `visibilitychange`.
The fix releases the registration on `beforeunload`.
Four `Page.reload` calls and two `window.location.reload()` calls then avoided duplicate registration errors.

The macOS Forward+ review removed synthetic mouse clicks, focus scripts, and cross-frame focus retries.
`cef.FocusMode` and `cef.GrabFocus()` remained necessary.
The user confirmed no extra Dock or Mission Control entry.
These macOS observations do not establish Windows Spotlight behavior.

### Microphone permissions and the original Chat stall

AIRI stores `not-determined`, `granted`, or `denied` in `user://permissions.cfg`.
Browser permission state can remain `prompt`. AIRI host state is authoritative.
The exact origin of the main renderer is the only permitted audio requester.
Other permission types, origins, and windows receive denial.

Godot CEF uses the `Signal` permission policy.
The host coalesces native request IDs behind one opaque renderer prompt ID.
Denial, modal close, a two-minute timeout, and host shutdown deny pending requests.
See the pinned [permission settings](https://github.com/dsh0416/godot-cef/blob/v1.16.1/crates/gdcef/src/settings.rs)
and [grant/deny methods](https://github.com/dsh0416/godot-cef/blob/v1.16.1/docs/api/methods.md#permission-handling).

Every window that awaits microphone state must register its AIRI handlers.
Originally, Chat awaited an unhandled permission request before `chatStore.initialize()`.
Its `activeSessionId` remained empty, and send failed with `Failed to load the target chat session`.

`MicrophonePermissionService.Attach` now binds the required contexts, including Chat, onboarding, notice, and developer windows.
Only the main renderer owns prompts.
The microphone enable button resets a denied AIRI permission before the next request.
This retry requires an explicit button click. Automatic requests retain the stored denial.
An unhandled application invoke is a host integration error.
The proposed upstream default rejection in [godot-kirie#87](https://github.com/moeru-ai/godot-kirie/pull/87) closed without merge.
The AIRI handler attachment is the accepted fix.

### Tool call reruns

A provider can reuse a `toolCallId` across generation rounds within one assistant message.
AIRI's `invocationId` identifies the specific invocation selected in the chat history.

Kirie's [chat handler](../src-web/src/renderer/components/InteractiveArea.vue) uses the shared `ChatToolCallRerunEvent` type and forwards `invocationId` to the chat store.
The earlier handler declared its own event shape and omitted this field from the forwarded request.
The optional field let the old handler pass typecheck, but repeated call IDs caused an ambiguous-target error during a rerun.

The shared [rerun implementation](../../../packages/stage-ui/src/stores/tool-call-rerun.ts) rejects ambiguous targets before tool execution.
With the invocation ID, it reruns the selected call and updates only that call's results.
It also invalidates native continuation state for that round and later rounds because they depend on the previous result.
The [regression tests](../../../packages/stage-ui/src/stores/tool-call-rerun.test.ts) cover repeated call IDs, target selection, and result replacement.

### Authentication and external navigation

AIRI owns OIDC sign-in independently of the server sidecar.
It uses a system browser, PKCE, state validation, and a temporary `127.0.0.1` callback listener.
The renderer supplies the server URL and client ID before login.
Logout cancels an unfinished attempt.
Tests cover forged-state rejection without listener consumption and callback CORS.
See [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html).

External HTTP and HTTPS links use Kirie Platform `openExternalUrl()`.
AIRI filters other schemes, and Platform validates the absolute URL before `OS.shell_open()`.
Shutdown and hot reload restore `window.open` and remove the click handler.
A live `file:` request failed at the host boundary.

The data-directory API accepts no caller path.
Godot selects `OS.get_user_data_dir()`, opens it, and propagates operating-system errors.
The application name `AIRI` selects its own data directory.

### Inspector, routes, and browser state

AIRI selects the leader target from `/json/list` and opens its `devtoolsFrontendUrl`.
If no leader target has a usable Inspector URL, AIRI reports an error instead of selecting another page.
The bare debug-port page previously returned an empty body.
Godot CEF allows the remote Inspector origin `https://chrome-devtools-frontend.appspot.com`.
Production builds keep remote debugging disabled.
See the pinned [CEF properties](https://github.com/dsh0416/godot-cef/blob/v1.16.1/docs/api/properties.md)
and [security baseline](https://github.com/dsh0416/godot-cef/blob/v1.16.1/docs/api/security-baseline.md).

Standalone Devtools windows reuse validated routes and optional geometry.
The empty Electron Editor shell remains excluded.
A route-keyed error boundary isolates failures and permits later navigation.

Official Godot CEF 1.16.0 introduced the shared request-context behavior that closed GAP-028.
The tracked [1.16.1 release](https://github.com/dsh0416/godot-cef/releases/tag/v1.16.1) preserves that context and AIRI scheme handlers.
Cookies, storage, BroadcastChannel, and Web Locks must cross application windows.
The leader holds `tab-airi:stage:pinia`. A follower's request remains pending.
