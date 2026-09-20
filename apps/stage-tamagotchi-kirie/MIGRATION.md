# Stage Tamagotchi Kirie Migration

Status: In progress.

Evidence last verified: 2026-09-20 for published-package commands and live CEF smoke.
The latest full renderer route audit is from 2026-09-18.

The application targets the published Kirie 0.4.1 release.

## Document roles

This file records the migration scope, current status, architecture, and
acceptance requirements.

- [`README.md`](README.md) is the setup and operating guide.
- [`API-GAPS.md`](API-GAPS.md) is the reproduced capability-gap ledger.
- The Kirie architecture documents and package READMEs define producer
  contracts. They do not define AIRI migration status.

## Objective

Preserve the behavior of the Stage Tamagotchi renderer in a Kirie desktop
host. Use a Kirie-specific adapter for desktop services and native windows.

The Electron application is the behavior reference. The Kirie application
does not require source equality with the Electron host.

Use a reproduced AIRI runtime error to justify each new Kirie API. Do not add
an API for a feature that has no current in-scope failure.

## Current status

`API-GAPS.md` contains 28 reproduced gaps:

| Status | Count | Gaps |
| --- | ---: | --- |
| Accepted | 22 | GAP-001 through GAP-006, GAP-008, GAP-009, GAP-011 through GAP-022, GAP-027, and GAP-028 |
| In progress | 0 | None |
| Review pending | 0 | None |
| Runtime verification pending | 0 | None |
| Open | 0 | None |
| Blocked | 0 | None |
| Deferred | 6 | GAP-007, GAP-010, GAP-023 through GAP-026 |

The dependency files select the published Kirie 0.4.1 npm and NuGet packages.
They do not use sibling-repository package links or project references.

The 2026-09-20 published-package verification passed these operations:

- Frozen-lockfile installation.
- TypeScript type verification.
- Eleven unit-test files with 31 passing tests.
- C# build with no warnings or errors.
- Kirie build.

The 2026-09-20 live session started the main renderer on Kirie 0.4.1 and Godot
CEF 1.16.1. It opened Settings and Chat, reused the Settings window, and
navigated Settings to MCP and data pages. Native close removed Settings and
Chat. A later open created each window again.

The same session shared a cookie, a `localStorage` value, a BroadcastChannel
message, and the held `tab-airi:stage:pinia` Web Lock across those WebViews.
It also opened an external URL through `window.open()`. It opened the
application data directory.

The build reports non-blocking Vite, UnoCSS, browser-externalization, and
large-chunk warnings.

The latest live session reported these known requests:

- `server-channel:get-config` maps to deferred GAP-010.
- `plugins:tools:list-xsai` maps to deferred GAP-023.
- `artistry:sync-config` maps to deferred GAP-024.
- `mcp:get-runtime-status` and `mcp:read-config-text` map to deferred GAP-025.
- The updater is disabled. Production packaging and updates are deferred for this migration.
- `godot-stage:get-status` belongs to the excluded model-rendering scope.

The 2026-09-18 route audit covered every unique static renderer path and
representative values for all parameterized paths in real CEF. Route failures
are isolated by a route-keyed error boundary, so navigation can recover without
blanking the previous page.

## Runtime path

The application uses this path:

```text
Stage Tamagotchi Vue renderer
  -> AIRI host contracts
  -> @gd-kirie/platform and @gd-kirie/ipc-eventa
  -> Kirie IPC
  -> GdKirie.Platform and AIRI Godot handlers
  -> Godot and operating-system APIs
```

The production Web entry stays at `res://src-web/dist/index.html`.

The source reference is `apps/stage-tamagotchi/src/renderer/`. Shared renderer
contracts come from `apps/stage-tamagotchi/src/shared/`.

Do not replace Stage Tamagotchi with `apps/stage-web`.

## Repository ownership

- `apps/stage-tamagotchi-kirie/` owns the Kirie desktop application.
- `apps/stage-tamagotchi/` owns the Electron behavior reference.
- `engines/stage-tamagotchi-godot/` remains a separate AIRI Godot runtime.
- The sibling `godot-kirie/` repository owns Kirie Core, Kirie Platform, the
  CLI, and its public packages.

Normal AIRI setup does not require a sibling `godot-kirie/` checkout. Use the
sibling repository only when a reproduced gap requires a Kirie API change.

## Design rules

1. Keep Kirie Core limited to WebView lifecycle and IPC transport.
2. Use Godot APIs when Godot supplies the required behavior.
3. Put general desktop capabilities in Kirie Platform.
4. Put AIRI business services in AIRI Godot handlers.
5. Use platform-neutral names for public Kirie APIs.
6. Do not add an Electron `BrowserWindow` compatibility facade.
7. Do not add mock behavior that hides a missing capability.
8. Keep one Eventa context owner in each renderer.
9. Keep Godot window operations on the main thread.
10. Add only APIs that a reproduced Stage Tamagotchi error requires.
11. Keep model-related capabilities outside this migration milestone.
12. Keep Spotlight deferred until the user reopens that scope.
13. Do not make commits unless the user requests commits.

## Godot-first decision order

For each reproduced gap, use this order:

1. Find the Godot API, node, signal, project setting, or lifecycle.
2. If the capability is general, expose it through Kirie Platform.
3. If the capability is AIRI-specific, implement it in an AIRI Godot handler.
4. Add operating-system-specific code only when Godot cannot supply the behavior.
5. Add a sidecar only when Godot and the current runtime cannot supply the behavior.

Record the observed Godot limit in `API-GAPS.md` before native or sidecar work.
Get user approval before you add a native dependency or sidecar.

## Current scope exclusions

The current milestone excludes these model areas:

- Live2D rendering and runtime integration.
- VRM rendering and runtime integration.
- MMD rendering and runtime integration.
- Model asset downloads and packaging.
- Model-specific media permissions or capture behavior.

Do not add model-related errors to `API-GAPS.md`. Do not add Kirie APIs for
these errors.

The current milestone also defers these Spotlight areas:

- Shortcut registration and persistence.
- Application-window creation and lifecycle.
- Result notifications and related navigation.

Keep GAP-007 deferred until the user reopens Spotlight work.

## Dependency baseline

The AIRI baseline uses the coordinated Kirie 0.4.1 release:

- npm: `kirie`, `@gd-kirie/ipc`, `@gd-kirie/ipc-eventa`, and
  `@gd-kirie/platform`.
- NuGet: `GdKirie.EventaAdapter` and `GdKirie.Platform`.
- Godot addon: the official `kirie-addon.zip` content from Kirie 0.4.1.
- Godot CEF: version 1.16.1 with the checksum from its official release.

The Kirie addon and AIRI configuration select the same Godot CEF release.
Kirie installed Godot CEF 1.16.1 with the published SHA-256 digest, and the
macOS framework passes strict code-signature verification.

Source: [Kirie v0.4.1 release](https://github.com/moeru-ai/godot-kirie/releases/tag/v0.4.1).

AIRI has exact `minimumReleaseAgeExclude` entries for the Kirie npm packages.
Later versions remain subject to the normal pnpm release-age rule. See the
[pnpm dependency-resolution settings](https://pnpm.io/settings/dependency-resolution).

Do not restore committed `link:` dependencies or `ProjectReference` entries.
Do not copy Kirie Platform contracts or implementations into AIRI.

If a new gap requires a Kirie change, use sibling packages only for that API
batch. Return AIRI to one coordinated published version before acceptance.

## Godot CEF state

`addons/kirie/godot_cef.json` declares Godot CEF 1.16.1 and its published
SHA-256 digest. Kirie installed that asset.
The macOS framework passes strict code-signature verification.

On 2026-09-19, official Godot CEF 1.16.0 shared a cookie, local storage, a
BroadcastChannel message, and a held Web Lock between the leader and Settings
WebViews. The probes removed their temporary state after verification.

On 2026-09-20, the tracked Godot CEF 1.16.1 release repeated those shared-context
checks during the Kirie 0.4.1 live session. GAP-028 is accepted.

[Godot CEF 1.16.1](https://github.com/dsh0416/godot-cef/releases/tag/v1.16.1)
keeps that shared request context and preserves AIRI scheme handlers.

Kirie 0.4.1 resolves each WebView permission request through an application
policy. It does not provide an operating-system prompt or persistent browser
permission state. AIRI now owns the microphone decision in the Godot host and
shows the prompt inside the main Renderer. The decision persists until the
user resets it in Settings.

The runtime verification covered Allow, a repeated request without a second
prompt, reset, a new prompt after reset, and Deny. The granted request returned
a live audio track, which the test stopped immediately. The permission dialog
uses the screen-capture shade and blur with the rounded Stage boundary. The
runtime verification and UI review are complete for GAP-016 and GAP-017.

## Phase status

| Phase | Status | Result |
| --- | --- | --- |
| Phase 0 | Complete | The repositories, worktrees, and protected paths were examined. |
| Phase 1 | Complete | The Kirie project is at `apps/stage-tamagotchi-kirie/`. |
| Phase 2 | Complete | The Stage Tamagotchi renderer and shared contracts were adapted. |
| Phase 3 | Complete | `API-GAPS.md` records reproduced runtime gaps. |
| Phase 4 | Complete | Each WebView uses one application-owned Eventa context. |
| Phase 5 | Complete | Existing Kirie Platform APIs support the required control flows. |
| Phase 6 | In progress | The application uses published Kirie 0.4.1 packages. The smoke flow and milestone acceptance are not complete. |

Do not repeat a completed phase unless current evidence shows a regression.

## Remaining work

Onboarding was not available. Renderer storage has `onboarding/completed` set to
true.

The fade-on-hover notice window was not available. Fade-on-hover is already
enabled in renderer storage.

The 2026-09-20 live session completed these smoke areas:

- Main Controls Island.
- Settings open, reuse, and in-window navigation.
- Chat.
- Native close and reopen of Settings and Chat.
- Shared request context on Godot CEF 1.16.1.
- External URL opening through `window.open()`.
- Application data directory opening.

## Deferred work

| Gap | Status | Reason | Reopen condition |
| --- | --- | --- | --- |
| GAP-007 | Deferred | Spotlight is outside the current milestone. | The user reopens Spotlight. |
| GAP-010 | Deferred | The server channel requires an AIRI sidecar. | The user reopens sidecar work. |
| GAP-023 | Deferred | The Node.js plugin host requires an AIRI sidecar. | The user reopens sidecar work. |
| GAP-024 | Deferred | Artistry provider orchestration requires an AIRI sidecar. | The user reopens sidecar work. |
| GAP-025 | Deferred | MCP configuration and stdio server processes require an AIRI sidecar. | The user reopens sidecar work. |
| GAP-026 | Deferred | Production packaging and updates are outside the current migration scope. | The user reopens production packaging work. |

The sidecar work belongs to AIRI, not Kirie Platform. It remains outside the
current migration scope.

## Untested surfaces

These surfaces were not part of the latest runtime session:

- Widget flows.
- Desktop-overlay startup and polling.
- Devtools pages other than the developer launcher, Markdown Stress, IO Tracer,
  and updater entry points.
- Updater operations after route setup and MCP actions after initial status and
  configuration reads.

An untested surface is not an API gap. Add a gap only after an in-scope runtime
error reproduces the missing behavior.

## API batch workflow

Use this workflow when a new in-scope gap requires implementation:

1. Reproduce one missing capability.
2. Find the Godot API or lifecycle for the behavior.
3. Record the input, current result, and required result.
4. Select Kirie Core, Kirie Platform, or AIRI as the owner.
5. Select one or two related APIs.
6. Implement the complete browser and Godot path.
7. Add tests that reproduce the original failure.
8. Run the relevant verification commands.
9. Run the affected Stage Tamagotchi flow through `kirie dev`.
10. Inspect the CEF and Godot logs.
11. Complete an independent review.
12. Resolve all blocking findings.

## Acceptance requirements

The migration milestone is accepted only when all statements are true:

- Every in-scope gap is accepted, blocked, or deferred.
- No in-scope gap remains open.
- The installed Godot CEF artifact matches the tracked shared-context dependency and passes signature verification.
- The published packages pass the full desktop smoke flow.
- TypeScript and C# contracts agree.
- Required errors propagate to the caller.
- Godot window work stays on the main thread.
- AIRI uses one coordinated published Kirie version.
- The Web entry remains `res://src-web/dist/index.html`.

Deferred gaps do not prevent milestone acceptance. Their reopen conditions
must remain in this file and `API-GAPS.md`.

## Verification commands

Run AIRI commands from `apps/stage-tamagotchi-kirie/`:

```sh
mise x -- pnpm typecheck
mise x -- pnpm test:unit
mise x -- dotnet build
mise x -- pnpm build
mise x -- pnpm kirie dev
```

Run the frozen installation from the AIRI repository root:

```sh
mise x -- pnpm install --frozen-lockfile
```

Only when Kirie source changes, run the upstream commands from the sibling
`godot-kirie/` repository:

```sh
mise run lint:biome
mise run lint:csharp
mise run test:unit
mise run test:dotnet
mise run typecheck
```

After an IPC change, verify one real request and response through the desktop
application. After a host change, run the scenario that required the change.

## Application-owned capabilities

These capabilities stay in AIRI unless a separate decision makes them general:

- AIRI plugin host.
- AIRI server and plugin-sidecar lifecycle.
- MCP stdio services.
- AIRI update policy.
- AIRI server channel.
- AIRI Artistry configuration.
- AIRI authentication flow.
- AIRI Spotlight shortcuts, windows, and notifications.
- AIRI model and Stage protocols.

Register these handlers on the AIRI Eventa context above Kirie Platform.

## Final application boundary

`apps/stage-tamagotchi-kirie/` is the final Kirie application location. Do not
merge it into `engines/stage-tamagotchi-godot/`.

The Electron application remains a supported AIRI target and the behavior
reference. Do not remove its transport paths as part of this migration.
