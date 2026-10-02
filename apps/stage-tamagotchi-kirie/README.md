# Stage Tamagotchi Kirie

This application runs the Stage Tamagotchi Vue renderer in a Godot desktop host.
Kirie supplies the WebView and IPC transport. AIRI owns application services and native windows.

Use this application for Kirie desktop development.
The Electron application remains supported and supplies the behavior reference.
Production packaging remains deferred. Windows CEF shutdown still fails.

## Documentation

| Document | Owns |
| --- | --- |
| This README | Setup, commands, and environment failures |
| [Migration status](MIGRATION.md) | The 29 capabilities, platform decisions, blockers, dependencies, and deferred work |
| [Host architecture](docs/host-architecture.md) | Runtime boundaries, ownership, and implementation requirements |
| [Platform verification](docs/verification.md) | Dated acceptance evidence and automation limits |
| [Ablation review](docs/ablation-review.md) | Whole-framework decisions, compact experiment evidence, and review limits |

## Setup and development

Install [mise](https://mise.jdx.dev/getting-started.html).
The root [.tool-versions](../../.tool-versions) selects Node.js, pnpm, and .NET.
The local [mise.toml](mise.toml) selects Godot Mono.
[StageTamagotchiKirie.csproj](StageTamagotchiKirie.csproj) requires .NET 10 and Godot.NET.Sdk 4.7.2.

From the repository root, install the workspace tools and dependencies:

```sh
mise install
mise x -- pnpm install
cd apps/stage-tamagotchi-kirie
mise install
```

Run all remaining application commands from this directory.
Dependency installation creates `node_modules/.gdignore` so Godot skips the dependency directory. Git ignores the entire directory.

Install the Kirie addon that matches the npm and NuGet packages:

```sh
mise x -- pnpm kirie doctor --fix kirie-addon
```

The command downloads the official `0.7.0` addon and checks its declared version.
The addon supplies `addons/kirie/`, including `KirieClient.cs`. Git ignores this installed dependency.
After a Kirie version change, run the command again.

Inspect the installed environment:

```sh
mise x -- pnpm kirie doctor
```

The doctor does not inspect .NET. Missing Android SDK or export templates alone do not block desktop development.
Exports require matching Godot export templates. Android work also requires the Android SDK.

If CEF is absent or stale, install the configured backend:

```sh
mise x -- pnpm kirie doctor --fix godot-cef
```

The [installer](https://github.com/moeru-ai/godot-kirie/blob/v0.7.0/packages/cli/src/doctor/addons.ts) verifies the Godot CEF archive and records its checksum under `.godot/kirie/`.
The [doctor](https://github.com/moeru-ai/godot-kirie/blob/v0.7.0/packages/cli/src/doctor/index.ts) checks required addon files, the Kirie version, and the CEF checksum marker.
It does not hash installed native files or inspect macOS signatures.

After a CEF version change, repeat installation.
Before acceptance, make sure that the installed artifact matches the release.
On macOS, also make sure that the framework passes strict signature verification.
If installation or signatures fail, record the exact upstream failure before a dependency workaround.

Build C# before the first development session:

```sh
mise x -- dotnet build
mise x -- pnpm kirie dev
```

`kirie dev` starts Vite, Godot, and CEF renderers.
The [dev command](https://github.com/moeru-ai/godot-kirie/blob/v0.7.0/packages/cli/src/dev.ts) reuses the last C# build.
After a C# change, repeat both commands.
Spotlight opens through its global shortcut and has no in-app entry point.

## Checks and build

From this application directory, run:

```sh
mise x -- pnpm typecheck
mise x -- pnpm test:unit
mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests
mise x -- pnpm build
```

`pnpm build` runs `kirie build` for Web assets and C#.
It does not export or package the application.

From the repository root, run:

```sh
mise x -- pnpm typecheck
mise x -- pnpm lint
```

Build success does not establish native acceptance.
[Verification](docs/verification.md) and [ablation evidence](docs/ablation-review.md) record historical command results.

## Environment failures

| Symptom | Action |
| --- | --- |
| Godot is absent or a C# change has no effect | Use the application directory and rebuild C# before development. |
| CEF is absent or its marker is stale | Run the CEF installation command. |
| CEF signature verification fails | Record the exact failure. A matching marker can cause the installer to skip an invalid framework. |
| `Accelerated OSR unavailable` | Make sure that desktop uses Forward+ with Metal, Direct3D 12, or Vulkan. |
| NuGet reports a missing pinned release | Compare feed metadata with the [dependency evidence](MIGRATION.md#dependency-baseline). |
| Native or IPC behavior fails | Find its capability and accepted scope in [MIGRATION.md](MIGRATION.md). |
