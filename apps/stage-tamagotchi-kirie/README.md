# Stage Tamagotchi Kirie

This application runs the Stage Tamagotchi Vue renderer in a Godot desktop host.
Kirie supplies the WebView and IPC transport. AIRI owns application services and native windows.

Use this application for Kirie desktop development.
The Electron application remains supported and supplies the behavior reference.
[Host architecture](docs/host-architecture.md) describes runtime ownership and lifecycle.

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
mise x -- pnpm kirie doctor --fix plugin:core
mise x -- pnpm kirie doctor --fix plugin:notifications
mise x -- pnpm kirie doctor --fix plugin:tray
```

Run the remaining application commands from this directory.
The Core plugin installs Kirie, Godot CEF, and the core NuGet packages.
The Notifications plugin installs its addon, NuGet host, and notification scheduler.
The Tray plugin installs its addon and the `GdKirie.Tray` NuGet package.
Git ignores these installed dependencies. Dependency installation creates `node_modules/.gdignore` so Godot skips that directory.
After a dependency version change, repeat the corresponding plugin installation command.

Build C# and start development:

```sh
mise x -- dotnet build
mise x -- pnpm kirie dev
```

`kirie dev` starts Vite, Godot, and the CEF renderers.
The [dev command](https://github.com/gd-kirie/gd-kirie/blob/v0.14.2/packages/cli/src/commands/dev.ts) checks required addons and reuses the last C# build.
After a C# change, repeat both commands.
Spotlight opens through its global shortcut and has no in-app entry point.

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
| Packaging and updates | Exports, signatures, installation, update manifests, and relaunch |
| Auxiliary windows | Inlay, Widgets list, Caption, and BeatSync. Their tray items stay disabled. |

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
mise x -- pnpm test:unit
mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests
mise x -- dotnet format --verify-no-changes
mise x -- pnpm build
```

`pnpm build` builds Web assets and C#. It does not export or package the application.
Root test commands do not run the application's frontend suite or C# harness.

From the repository root, run:

```sh
mise x -- pnpm typecheck
mise x -- pnpm lint
```

## Environment failures

| Symptom | Action |
| --- | --- |
| Godot is absent or a C# change has no effect | Use the application directory and rebuild C# before development. |
| An addon or NuGet package is absent or stale | Repeat its plugin installation command, then run `mise x -- pnpm kirie doctor`. |
| Doctor reports a missing Android SDK or export template | Desktop development does not require Android tools or export templates. Exports require matching templates. |
| CEF signature checks fail | Record the upstream failure. The installer marker does not establish that installed files or signatures remain valid. |
| `Accelerated OSR unavailable` | Make sure that desktop uses Forward+ with Metal, Direct3D 12, or Vulkan. |
| NuGet reports a missing pinned release | Compare official feed metadata with the package reference before a dependency workaround. |

The [installer](https://github.com/gd-kirie/gd-kirie/blob/v0.14.2/packages/cli/src/commands/doctor/addons.ts) checks archive digests and records them under `.godot/kirie/`.
The [doctor](https://github.com/gd-kirie/gd-kirie/blob/v0.14.2/packages/cli/src/commands/doctor/index.ts) checks configured dependencies and versions.
It does not hash installed native files or inspect macOS signatures.
