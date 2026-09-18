# Stage Tamagotchi Kirie

Stage Tamagotchi Kirie runs the Stage Tamagotchi Vue renderer in a Godot
desktop host. Kirie provides the WebView and IPC transport. Kirie Platform
provides general desktop capabilities.

AIRI C# handlers provide the application services and native windows that the
current migration implements. Some Electron services do not yet have a Kirie
implementation.

Status last verified: 2026-09-18.

## When to use this application

Use this application to develop and verify the Kirie desktop host for Stage
Tamagotchi. Use the Electron application as the behavior reference.

Do not use this application to verify these features:

- Live2D, VRM, or MMD rendering.
- Model asset downloads or packaging.
- Model-specific media capture.
- Spotlight windows and shortcuts.
- Production desktop packaging.

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

The tracked configuration still selects official Godot CEF 1.15.4. That build
does not share browser state between AIRI WebViews. The 2026-09-18 local
verification uses the unpublished `lemonnekogh/shared-request-context` branch.
See GAP-028 in [`API-GAPS.md`](API-GAPS.md) before an acceptance run.

The configured Godot CEF version does not prove the version of an installed
native artifact. Reinstall the artifact after the configured version changes.
Then verify its version and signature before an acceptance run.

## Development

Start a development session:

```sh
mise x -- pnpm kirie dev
```

The command starts Vite, Godot, and the CEF renderers. The application can open
the main, onboarding, settings, chat, and notice windows.

The development session currently reports some known IPC errors. See
[`API-GAPS.md`](API-GAPS.md) for their evidence and ownership:

- `server-channel:get-config` is blocked by the AIRI sidecar decision.
- `plugins:tools:list-xsai` is blocked by the AIRI plugin-host decision.
- `artistry:sync-config` is open and needs an AIRI ownership decision.
- MCP runtime and configuration requests are blocked by the AIRI sidecar decision.
- The updater is disabled while GAP-026 defines Godot packaging and update policy.
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

The 2026-09-18 verification passed these operations:

- Frozen-lockfile workspace installation.
- TypeScript type verification.
- Eleven unit-test files with 31 passing tests.
- C# build with no warnings or errors.
- Kirie build.
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

Kirie 0.3.0 exposes each request through `PermissionRequested`. The AIRI Godot
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

The local shared-context Godot CEF build passes strict code-signature
verification. Final acceptance still requires a published and tracked artifact.

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
| The console reports a documented IPC error | The related migration gap is not accepted. | Find the error in `API-GAPS.md` and use its reopen condition. |
