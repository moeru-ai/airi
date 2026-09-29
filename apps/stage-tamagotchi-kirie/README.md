# Stage Tamagotchi Kirie

Stage Tamagotchi Kirie runs the Stage Tamagotchi Vue renderer in a Godot desktop host.
Kirie supplies the WebView and IPC transport. AIRI supplies application services and native windows.

Use this application for development of the Kirie desktop host.
Use the Electron application as the behavior reference.
Do not treat this application as a production desktop package.

## Documentation

- This README contains setup, development, checks, and troubleshooting commands.
- [MIGRATION.md](MIGRATION.md) contains the dependency baseline, architecture, scope, all 29 migration items, platform results, and evidence.

## Setup

Install workspace dependencies from the repository root:

```sh
mise x -- pnpm install
```

Change to the application directory:

```sh
cd apps/stage-tamagotchi-kirie
```

Run all remaining application commands from this directory.

The local `mise.toml` selects the Godot version.
Commands from another directory can use a different Godot installation or find no installation.

Inspect the local environment:

```sh
mise x -- pnpm kirie doctor
```

Desktop development requires Godot, .NET, and Godot CEF.
Export templates are necessary for Godot exports.
The Android SDK is necessary only for Android work.

If Godot CEF is absent or stale, install the configured backend:

```sh
mise x -- pnpm kirie doctor --fix godot-cef
```

Kirie compares the release with the SHA-256 digest in `addons/kirie/godot_cef.json`.
The configured version alone does not establish the version of an installed native artifact.

After a CEF version change, repeat the installation command.
Before an acceptance run, make sure that the installed artifact matches the configured release.
On macOS, also make sure that the framework passes strict code-signature verification.

## Development

Start the development session:

```sh
mise x -- pnpm kirie dev
```

The command starts Vite, Godot, and the CEF renderers.
The application owns separate native windows for its desktop flows.
The Spotlight window opens through its global shortcut and has no in-app entry point.

`kirie dev` reuses the last C# build.
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
| The CEF artifact is stale or the macOS framework lacks a valid signature | The installed artifact differs from the configured release or lacks a valid signature. | Repeat the Godot CEF installation command. |
| A C# change has no effect | The session uses the previous assembly. | Run `mise x -- dotnet build` before the next session. |
| Godot CEF reports `Accelerated OSR unavailable` | The active renderer and graphics backend do not provide accelerated OSR. | Make sure that desktop uses Forward+ with Metal, Direct3D 12, or Vulkan. |
| NuGet restore reports a missing pinned version | Package feed metadata can differ from published artifacts. | Compare the failure with the dependency evidence in [MIGRATION.md](MIGRATION.md). |
| An IPC request fails or native behavior differs from Electron | The flow needs comparison with the accepted scope and platform evidence. | Find the related item in [MIGRATION.md](MIGRATION.md). |
