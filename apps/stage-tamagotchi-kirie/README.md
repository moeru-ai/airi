# Stage Tamagotchi Kirie

Stage Tamagotchi Kirie runs the Stage Tamagotchi Vue renderer in a Godot
desktop host. Kirie provides the WebView and IPC transport. Kirie Platform
provides general desktop capabilities.

AIRI C# handlers provide the application services and native windows that the
current migration implements. Some Electron services do not yet have a Kirie
implementation.

Command verification and live CEF smoke: 2026-09-21 on Kirie 0.4.2, Godot 4.7.2,
and Godot CEF 1.16.1.
The latest full renderer route audit is from 2026-09-18.

## When to use this application

Use this application to develop and verify the Kirie desktop host for Stage
Tamagotchi. Use the Electron application as the behavior reference.

Do not use this application to verify these features:

- Live2D, VRM, or MMD rendering.
- Model asset downloads or packaging.
- Model-specific media capture.
- Server channel, plugin host, Artistry, and MCP sidecar services.
- Production desktop packaging and application updates.

## Migration documentation

- This README is the setup and operating guide.
- [`API-GAPS.md`](API-GAPS.md) records reproduced capability gaps and runtime
  evidence.
- [`MIGRATION.md`](MIGRATION.md) records the migration scope, current status,
  and acceptance requirements.

## Setup

Run the workspace installation from the repository root:

```sh
mise x -- pnpm install
```

Then run all application commands from this directory:

```sh
cd apps/stage-tamagotchi-kirie
```

The local `mise.toml` supplies the required Godot version. A command from a
different directory can use the wrong Godot installation or no installation.

Verify the local environment:

```sh
mise x -- pnpm kirie doctor
```

For desktop development, the Godot, .NET, and Godot CEF results are relevant.
Missing export templates block Godot exports. A missing Android SDK blocks
Android verification, but it does not block the desktop development session.

Install the pinned Godot CEF backend when it is absent or out of date:

```sh
mise x -- pnpm kirie doctor --fix godot-cef
```

The tracked configuration selects official Godot CEF 1.16.1.
This release keeps the shared request context from 1.16.0.
See GAP-028 in [`API-GAPS.md`](API-GAPS.md) for the runtime evidence.

Kirie verifies the installed release against the SHA-256 digest in
`addons/kirie/godot_cef.json`. The installed macOS framework also passes
strict code-signature verification.

The configured Godot CEF version does not prove the version of an installed
native artifact. Reinstall the artifact after the configured version changes.
Then verify its version and signature before an acceptance run.

## Development

Start a development session:

```sh
mise x -- pnpm kirie dev
```

The command starts Vite, Godot, and the CEF renderers. The application can open
the main, onboarding, settings, chat, notice, and Spotlight windows.

The Spotlight window has no in-app entry point. It opens from its global
shortcut only.

`kirie dev` reuses the last C# build. After a change under `src-godot/`, run
`mise x -- dotnet build` first, or the session keeps running the previous
assembly.

The latest live session reported these known IPC errors.
See [`API-GAPS.md`](API-GAPS.md) for their evidence and ownership:

- `server-channel:get-config` is deferred with the AIRI sidecar work.
- `plugins:tools:list-xsai` is deferred with the AIRI sidecar work.
- `artistry:sync-config` is deferred with the AIRI sidecar work.
- MCP runtime and configuration requests are deferred with the AIRI sidecar work.
- The updater is disabled. Production packaging and updates are deferred for this migration.
- `godot-stage:get-status` belongs to the excluded model-rendering scope.

## Verification

Run these commands from this directory:

```sh
mise x -- pnpm typecheck
mise x -- pnpm test:unit
mise x -- dotnet build
mise x -- pnpm build
```

`pnpm build` runs `kirie build`. It builds the Web assets in `src-web/dist` and
the Godot C# project. It does not export or package a desktop application.
GAP-026 remains deferred until production packaging returns to the migration
scope.

The 2026-09-20 published-package verification passed these operations:

- Frozen-lockfile workspace installation.
- TypeScript type verification.
- Eleven unit-test files with 31 passing tests.
- C# build with no warnings or errors.
- Kirie build.

The 2026-09-21 published-package verification repeated those operations on
Kirie 0.4.2 and Godot 4.7.2:

- Frozen-lockfile workspace installation, which passes the supply-chain policy check.
- TypeScript type verification.
- Thirteen unit-test files with 41 passing tests.
- C# build with no warnings or errors, for the application and the contract tests.
- Kirie build.

The Godot 4.7.2 upgrade makes older Godot 4.7.1 export templates stale. AIRI
installed the matching Godot 4.7.2 templates, and `kirie doctor` accepts them.
The remaining `kirie doctor` failure is the Android SDK, which only blocks
Android verification.

The 2026-09-20 live session on Kirie 0.4.1 and Godot CEF 1.16.1 passed these
operations:

- Development startup of the main renderer.
- Settings open, reuse, and navigation to MCP and data pages.
- Chat open with the minimal runtime.
- Native close and reopen of Settings and Chat.
- Shared cookie, `localStorage`, BroadcastChannel, and Web Lock state.
- External URL opening through `window.open()`.
- Application data directory opening.

A second 2026-09-20 screening session found that the chat window opens but
cannot send a message. GAP-029 in [`API-GAPS.md`](API-GAPS.md) records the
reproduced stall. The same session re-verified ten Settings routes and the
notice confirm flow. A third 2026-09-20 session attached
`MicrophonePermissionService` to every AIRI window context and verified a
full chat send round trip in real CEF. User review accepted GAP-029.

That session used the OpenGL compatibility renderer. Godot CEF used software
rendering. Accelerated OSR was unavailable. The main renderer still painted.

The project now selects Forward+ on desktop and Mobile on iOS and Android.

The 2026-09-21 live session ran the same desktop flow on Kirie 0.4.2, Godot
4.7.2, and Godot CEF 1.16.1. It started the main renderer and the Controls
Island, opened Settings, reused that window on a second request, and rendered
`#/settings`, `#/settings/connection`, `#/settings/modules/mcp`, and
`#/settings/data`. It opened Chat at `stage-runtime=minimal` and rendered an
existing conversation. It repeated the shared cookie, `localStorage`,
BroadcastChannel, and Web Lock checks.

On Forward+, Godot CEF 1.16.1 reported `accelerated_osr_supported=true` on the
Metal backend, and AIRI created each browser in accelerated rendering mode.
Native close and reopen, external URL opening, and application data directory
opening were not repeated in that session.

The 2026-09-18 real CEF verification passed these operations:

- Development startup of the main and onboarding renderers.
- A real-CEF route audit of all unique static paths and representative parameterized paths.
- Back navigation after repaired route failures.

The build still reports non-blocking Vite, UnoCSS, browser-externalization, and
large-chunk warnings.

## Runtime architecture

The main renderer starts with `synced-leader=true`. AIRI creates onboarding,
settings, chat, notice, and standalone devtools renderers in separate native
Godot windows. These renderers start with `synced-leader=false`. Kirie omits
the empty Electron Editor shell. Each native window except the main Stage
window has a shared opaque white background.

The native windows use Godot multi-window and close-request behavior. See the
[Godot Window documentation](https://docs.godotengine.org/en/4.7/classes/class_window.html)
and the
[Viewport subwindow documentation](https://docs.godotengine.org/en/4.7/classes/class_viewport.html#class-viewport-property-gui-embed-subwindows).

Godot owns the transparency of the main Stage window. `project.godot` enables
a borderless transparent window and a transparent root viewport. Kirie
provides the transparent CEF background. See the
[Godot 4.7 project settings](https://docs.godotengine.org/en/4.7/classes/class_projectsettings.html#class-projectsettings-property-display-window-per-pixel-transparency-allowed).

## Microphone permission

Godot CEF uses its per-request signal policy for browser permissions. AIRI
validates microphone requests from the exact origin of the main renderer. It
denies other permission types and requests from secondary windows.

Kirie 0.4.2 exposes each request through `PermissionRequested`. The AIRI Godot
host keeps the application decision as `not-determined`, `granted`, or
`denied`. For a new decision, AIRI shows a modal inside the main Renderer. The
modal uses the screen-capture dialog shade and blur. Its overlay follows the
rounded boundary of the transparent Stage window.

Allow and Deny remain active until the user resets the decision in
Settings > System > Permission Management. Resetting a grant also stops the
active microphone stream. AIRI resolves the pending native request with
`GrantPermission()` or `DenyPermission()` after the renderer responds.

A live Allow request returned an enabled, unmuted track on 2026-09-17. A second
request used the saved grant without another modal. Reset caused a new prompt,
and Deny returned `NotAllowedError`. The browser state stays at `prompt`
because CEF only provides request-scoped permission decisions. AIRI host state
is authoritative in Kirie.

The Godot CEF 1.16.0 shared request context passed the GAP-028 runtime checks.
The 2026-09-20 live session repeated those checks on the tracked 1.16.1 release.

## Account sign-in

AIRI owns desktop account sign-in. It opens the system browser, uses PKCE, and
accepts the callback through a temporary listener on `127.0.0.1`.

The flow follows [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html). It does
not depend on the deferred server sidecar. The renderer supplies its server URL
and client ID before each login attempt.

The loopback listener and callback behavior have automated coverage. A live
sign-in completed with the shared CEF request context on 2026-09-18. AIRI
stored the OIDC tokens and showed the authenticated account state.

## Troubleshooting

| Symptom | Meaning | Action |
| --- | --- | --- |
| `kirie doctor` reports missing export templates | The local Godot installation cannot export the application. | Install the matching Godot export templates before an export. |
| `kirie doctor` reports a missing Android SDK | Android verification is unavailable. | Configure the Android SDK only when Android work is required. |
| Godot is not found | The command did not load this directory's `mise.toml`. | Run the command from `apps/stage-tamagotchi-kirie`. |
| The configured CEF version is correct, but the framework is unsigned or stale | The installed native artifact does not match the configuration result. | Reinstall Godot CEF and verify the installed framework. |
| Godot CEF logs `Accelerated OSR unavailable` | Desktop is not on Forward+ with Metal, Direct3D 12, or Vulkan. | Set `rendering/renderer/rendering_method` to `forward_plus`. Software rendering still paints the WebView. |
| The console reports a documented IPC error | The related migration gap is deferred. | Find the error in `API-GAPS.md` and use its reopen condition. |
