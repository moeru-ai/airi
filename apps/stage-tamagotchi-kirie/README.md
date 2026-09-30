# Stage Tamagotchi Kirie

Stage Tamagotchi Kirie runs the Stage Tamagotchi Vue renderer in a Godot desktop host.
Kirie supplies the WebView and IPC transport. AIRI supplies application services and native windows.

Use this application for development of the Kirie desktop host.
Use the Electron application as the behavior reference.
Do not treat this application as a production desktop package.

## Documentation

| Document | Purpose |
| --- | --- |
| This README | Setup, development, checks, and troubleshooting |
| [Migration status](MIGRATION.md) | Scope, all 29 capabilities, open failures, deferred work, dependency baseline, and completion requirements |
| [Host architecture](docs/host-architecture.md) | Runtime ownership, source map, and implementation constraints |
| [Platform verification](docs/verification.md) | Dated platform results, acceptance evidence, and automation limits |
| [Ablation review](docs/ablation-review.md) | Simplification experiments, resize cursor checks, and coverage limits |

Windows exit still has a reproduced CEF crash. Later macOS checks do not establish Windows acceptance.
The [migration status](MIGRATION.md#remaining-acceptance-work) records remaining work.

## Prerequisites

Install [mise](https://mise.jdx.dev/getting-started.html).
The root [.tool-versions](../../.tool-versions) selects Node.js, pnpm, and .NET.
The local [mise.toml](mise.toml) selects Godot Mono.
The [C# project](StageTamagotchiKirie.csproj) requires .NET 10 and Godot.NET.Sdk 4.7.2.

Desktop development also requires the configured Godot CEF artifact.
Export templates are necessary for Godot exports. The Android SDK is necessary only for Android work.

## Setup

Install the workspace tools from the repository root:

```sh
mise install
```

Install workspace dependencies:

```sh
mise x -- pnpm install
```

Change to the application directory:

```sh
cd apps/stage-tamagotchi-kirie
```

Run all remaining application commands from this directory.

Commands from another directory can use a different Godot installation or find no installation.

Install the application tools:

```sh
mise install
```

Inspect the local environment:

```sh
mise x -- pnpm kirie doctor
```

The doctor also reports Android SDK and export-template failures. These failures alone do not block desktop development.
The doctor does not inspect .NET.

If Godot CEF is absent or stale, install the configured backend:

```sh
mise x -- pnpm kirie doctor --fix godot-cef
```

The installer checks the downloaded archive against the SHA-256 digest in [godot_cef.json](addons/kirie/godot_cef.json).
The doctor checks extension presence and a stored checksum marker. It does not inspect macOS signatures or hash installed native files.
See the pinned [CEF installer](https://github.com/moeru-ai/godot-kirie/blob/v0.6.5/packages/cli/src/doctor/godot-cef.ts)
and [doctor checks](https://github.com/moeru-ai/godot-kirie/blob/v0.6.5/packages/cli/src/doctor/index.ts).

After a CEF version change, repeat the installation command.
Before an acceptance run, make sure that the installed artifact matches the configured release.
On macOS, also make sure that the framework passes strict code-signature verification.

If an upstream artifact fails installation or signature verification, record the exact failure before any dependency workaround.

## Development

Before the first development session, build the C# project.
Then start the development session:

```sh
mise x -- dotnet build
mise x -- pnpm kirie dev
```

`kirie dev` starts Vite, Godot, and the CEF renderers.
The application owns separate native windows for its desktop flows.
The Spotlight window opens through its global shortcut and has no in-app entry point.

The pinned [desktop dev command](https://github.com/moeru-ai/godot-kirie/blob/v0.6.5/packages/cli/src/dev.ts) reuses the last C# build.
A new session can therefore run an older assembly after a C# source change.

After a change under `src-godot/`, build the C# project before the next development session:

```sh
mise x -- dotnet build
mise x -- pnpm kirie dev
```

## Checks and build

Run the application checks from this directory:

```sh
mise x -- pnpm typecheck
mise x -- pnpm test:unit
mise x -- dotnet run --project tests/StageTamagotchiKirie.Tests
mise x -- pnpm build
```

`pnpm build` runs `kirie build`.
It builds the Web assets in `src-web/dist` and the Godot C# project.
It does not export or package a desktop application.

Run the workspace checks from the repository root:

```sh
mise x -- pnpm typecheck
mise x -- pnpm lint
```

Build success does not establish native runtime acceptance.
The migration document records the latest platform results and the scope of each accepted item.

## Troubleshooting

| Symptom | Meaning | Action |
| --- | --- | --- |
| Godot is not found | The command did not load the application `mise.toml`. | Run the command from `apps/stage-tamagotchi-kirie`. |
| `kirie doctor` reports missing export templates | The Godot installation cannot export the application. | Install templates that match Godot before an export. |
| `kirie doctor` reports a missing Android SDK | Android development is unavailable. | If Android work is required, configure the Android SDK. |
| Godot CEF is missing or its checksum marker is stale | The doctor cannot accept the configured installation. | Run `mise x -- pnpm kirie doctor --fix godot-cef`. |
| The macOS CEF framework fails signature verification | The current native artifact lacks a valid signature. If its checksum marker matches, the installer can skip it. | Record the exact signature failure and report the dependency failure. |
| A C# change has no effect | The session uses the previous assembly. | Run `mise x -- dotnet build` before the next session. |
| Godot CEF reports `Accelerated OSR unavailable` | The active renderer and graphics backend do not provide accelerated OSR. | Make sure that desktop uses Forward+ with Metal, Direct3D 12, or Vulkan. |
| NuGet restore reports a missing pinned version | Package feed metadata can differ from published artifacts. | Compare the failure with the dependency evidence in [MIGRATION.md](MIGRATION.md). |
| An IPC request fails or native behavior differs from Electron | The flow needs comparison with the accepted scope and platform evidence. | Find the related item in [MIGRATION.md](MIGRATION.md). |
