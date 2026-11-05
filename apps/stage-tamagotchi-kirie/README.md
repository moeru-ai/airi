# Stage Tamagotchi Kirie

This application runs the Stage Tamagotchi Vue renderer in a Godot desktop host.
Kirie supplies the WebView and IPC transport. AIRI owns application services and native windows.

Use this application for Kirie desktop development.
The Electron application remains supported and supplies the behavior reference.
Do not use this application for releases. Packaging and updates remain deferred.

## Setup and development

Install [mise](https://mise.jdx.dev/getting-started.html).
The root [.tool-versions](../../.tool-versions) selects Node.js, pnpm, and .NET.
The local [mise.toml](mise.toml) selects Godot Mono.
[package.json](package.json) and [StageTamagotchiKirie.csproj](StageTamagotchiKirie.csproj) own dependency versions.

From the repository root, install the tools and dependencies:

```sh
mise install
mise x -- pnpm install
cd apps/stage-tamagotchi-kirie
mise install
mise x -- pnpm bootstrap
```

Run the remaining application commands from this directory.
`pnpm bootstrap` installs the Core, Notifications, and Tray plugins with `kirie doctor --fix`.
The Core plugin installs Kirie, Godot CEF, and the core NuGet packages.
The Notifications plugin installs its addon, NuGet host, and notification scheduler.
The Tray plugin installs its addon and the `GdKirie.Tray` NuGet package.
Git ignores these installed dependencies.
After a dependency version change, run `pnpm bootstrap` again.

`bootstrap`, `dev`, and `build` create `node_modules/.gdignore` so Godot skips that directory.
Tracked `.gdignore` files make Godot skip `src-web/src` and `tests`.

Build C# and start development:

```sh
mise x -- dotnet build
mise x -- pnpm dev
```

`pnpm dev` runs `kirie dev`, which starts Vite, Godot, and the CEF renderers.
The [dev command](https://github.com/gd-kirie/gd-kirie/blob/v0.16.0/packages/cli/src/commands/dev.ts) checks required addons and reuses the last C# build.
After a C# change, repeat both commands.
Spotlight opens through its global shortcut and has no in-app entry point.

## Source layout

| Path | Content |
| --- | --- |
| `src-web/src` | Vue renderer: pages, layouts, components, stores, and host adapters |
| `src-web/src/shared` | Eventa contracts that the renderer shares with the Godot host |
| `src-godot` | Godot scenes and C# host code, grouped by window and service |
| `tests/StageTamagotchiKirie.Tests` | xUnit tests for the C# host code |

[Host architecture](docs/host-architecture.md) describes ownership and lifecycle.
[C# guide](docs/csharp-guide.md) describes the C# layout, names, and style.

## Scope and limitations

The desktop host supplies native windows, Spotlight, the system tray, permissions, authentication, desktop operations, and shared browser storage.
Model-specific rendering, assets, and media for Live2D, VRM, and MMD require separate verification.

The following work remains deferred:

| Area | Missing responsibility |
| --- | --- |
| Server channel | Server configuration, QR payload, listener, and WebSocket lifecycle |
| Plugin host | Discovery, workers, directory import, and extension lifecycle |
| Artistry | Credentials, provider jobs, downloads, and Widget updates |
| MCP | Configuration and stdio process lifecycle |
| Packaging and updates | Exports, signatures, installation, update manifests, relaunch, and the Updater devtools page |
| Auxiliary windows | Inlay, Widgets list, Caption, BeatSync, Dashboard, Editor, Desktop overlay, and the Notice list. Their tray items stay disabled. |
| Screen capture | Source selection, macOS permission, the Vision devtools page, and the Screen Capture devtools page |

Kirie has no pages for the deferred windows and devtools.
When a host capability exists, port its page from [stage-tamagotchi](../stage-tamagotchi/src/renderer/pages).

The Node services remain outside the Kirie bootstrap until AIRI supplies their runtime and lifecycle.
The workspace Node.js command is not a production sidecar.
The plugin inspector reports unavailable until its host operations exist.

System notification clicks and Windows behavior require native verification with the selected dependency versions.
Physical input, multiple displays, mixed DPI, and authentication require separate platform checks.
Linux system notifications remain outside the supported scope.
The Linux tray requires a StatusNotifierItem host. Without a tray, the application starts and logs an error.

## Checks and build

From the application directory, run:

```sh
mise x -- pnpm typecheck
mise x -- pnpm test:run
mise x -- pnpm test:csharp
mise x -- pnpm lint:csharp
mise x -- pnpm build
```

`pnpm build` builds Web assets and C#. It does not export or package the application.
Root `pnpm test:run` runs the frontend suite. CI runs the C# checks in a separate job.

From the repository root, run:

```sh
mise x -- pnpm typecheck
mise x -- pnpm lint
```

## Environment failures

| Symptom | Action |
| --- | --- |
| Godot is absent or a C# change has no effect | Use the application directory and rebuild C# before development. |
| An addon or NuGet package is absent or stale | Run `mise x -- pnpm bootstrap`, then run `mise x -- pnpm kirie doctor`. |
| Doctor reports a missing Android SDK or export template | Desktop development does not require Android tools or export templates. Exports require matching templates. |
| CEF signature checks fail | Record the upstream failure. The installer marker does not establish that installed files or signatures remain valid. |
| `Accelerated OSR unavailable` | Make sure that desktop uses Forward+ with Metal, Direct3D 12, or Vulkan. |
| NuGet reports a missing pinned release | Compare official feed metadata with the package reference before a dependency workaround. |

The [installer](https://github.com/gd-kirie/gd-kirie/blob/v0.16.0/packages/cli/src/commands/doctor/addons.ts) checks archive digests and records them under `.godot/kirie/`.
The [doctor](https://github.com/gd-kirie/gd-kirie/blob/v0.16.0/packages/cli/src/commands/doctor/index.ts) checks configured dependencies and versions.
It does not hash installed native files or inspect macOS signatures.
