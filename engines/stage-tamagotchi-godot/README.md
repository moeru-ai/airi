# `@proj-airi/stage-tamagotchi-godot`

Godot-native desktop stage runtime project for `stage-tamagotchi`.

## What It Does

- Hosts the Godot project used as the desktop-only stage runtime baseline.
- Provides the minimal scene, script, and .NET project structure for G0 stage work.
- Keeps Godot-owned assets, scenes, scripts, and future add-ons local to one workspace engine.

## What It Is Not

- It is not the Electron host app.
- It does not own AIRI agent logic or adaptation-layer IPC contracts.
- It is not a web or mobile renderer package.

## Current Scope

- Desktop-only Godot sidecar runtime exploration for `stage-tamagotchi`.
- Godot C# project structure and minimal runtime skeleton.
- Early-stage scene and runtime validation work.
- G1.1 VRM-only scene input baseline: Electron materializes the selected `.vrm`
  file, sends its native file path, and Godot imports it at runtime.

## Directory Layout

- `scenes/`: Godot scene files such as the current stage root.
- `scripts/`: C# runtime scripts attached to Godot nodes.
- `assets/`: Imported models, textures, materials, and other runtime assets.
- `addons/`: Godot plugins, editor/runtime add-ons, or vendored third-party Godot extensions.

## When To Use It

- Use it when working on the Godot-backed desktop stage runtime.
- Use it for Godot scene, asset, rendering, and character-runtime work.
- Use it as the engine boundary for the desktop Godot stage project itself.

## When Not To Use It

- Do not put Electron main/renderer host logic here.
- Do not put AIRI agent orchestration or cross-process protocol definitions here.
- Do not use it as a generic cross-platform stage abstraction package.

## Build

- `pnpm -F @proj-airi/stage-tamagotchi-godot build`
- `pnpm -F @proj-airi/stage-tamagotchi-godot typecheck`

Both commands currently run `dotnet build` against the Godot-generated C# project file.

## Development Runtime

The Electron development app does not export this project on every dev run. When
Godot Stage is started from the Tamagotchi settings page, Electron main starts a
local WebSocket bridge and launches a local Godot engine against this project:

```bash
godot --path ./engines/stage-tamagotchi-godot -- --airi-ws-url=<runtime-url>
```

Set `GODOT4` before starting the Electron development app. Dev mode requires an
explicit Godot executable path and does not auto-discover local installations.

PowerShell:

```powershell
$env:GODOT4 = "C:\Path\To\Godot_v4.x-stable_mono_win64.exe"
pnpm dev:tamagotchi
```

macOS / Linux:

```bash
GODOT4="/path/to/godot" pnpm dev:tamagotchi
```

With GodotEnv:

```bash
GODOT4="$(godotenv godot env path)" pnpm dev:tamagotchi
```

Keep machine-specific Godot paths outside the repository. The current Electron
main service reads `process.env.GODOT4`, so the shell or local development
environment must provide it before starting `pnpm dev:tamagotchi`.

## Editor Static Preview

Use this path when working on camera, lighting, rendering, scene composition,
animation state-machine experiments, or other stage behavior that should not
depend on Electron or runtime VRM import.

Place a local `.vrm` file under:

```text
engines/stage-tamagotchi-godot/assets/fixtures/vrm/
```

This directory is ignored by git. Do not commit model files.

`EditorPreviewRoot` in `scenes/stage-root.tscn` is intentionally committed as an
empty node. In the Godot editor, instantiate a local model under that node when
you need a concrete avatar in the 3D viewport. Keep the local scene change and
the model file out of commits unless a repo-owned fixture policy is introduced.

Runtime startup hides `EditorPreviewRoot` automatically. Product runtime avatars
still belong under `AvatarRoot`, where `StageSceneController` applies models
received from Electron.

This preview does not test `VrmRuntimeImporter.gd`. Use the runtime import path
for importer and materialized-path bugs.

## VRM Runtime Import

G1.1 vendors V-Sekai Godot add-ons through `git-subrepo` metadata:

- `addons/vrm`: VRM importer add-on, plugin version `2.0.1`,
  `only-addon` commit `651205484c35f5cd7ba56475ff636e10db8ad674`.
- `addons/Godot-MToon-Shader`: MToon shader add-on, plugin version `3.4.0`,
  `main` commit `268c0d3b19c0885698b7bd39e21a16c9c2af448f`.

Runtime import is routed through `scripts/vrm/VrmRuntimeImporter.gd` because the
Godot editor import plugin is not active when the exported sidecar receives a
model path from Electron. The current runtime bridge covers the VRM 0.x path by
wrapping the vendored `addons/vrm/vrm_extension.gd`; it does not yet register the
vendored VRM 1.0 `addons/vrm/1.0/VRMC_*.gd` extension set.

Godot owns the active avatar node lifetime: a newly imported avatar is added
under `AvatarRoot` first, then the previous avatar is removed and queued for
freeing. Failed imports keep the previous avatar visible.

Runtime import details live in [`docs/vrm-runtime-import.md`](docs/vrm-runtime-import.md).
Vendored add-on local patches and generated metadata differences are tracked in
[`docs/vendor-patches.md`](docs/vendor-patches.md).

## Live Debugging From The Godot Editor

Use this path when Electron is the real host and the model is selected from the
Tamagotchi settings window, but the running Godot scene needs to be inspected in
the Godot editor. The detailed workflow lives in
[`docs/live-debugging.md`](docs/live-debugging.md).

Start the Godot editor against this project:

```powershell
& $env:GODOT4 -e --path .\engines\stage-tamagotchi-godot
```

In the Godot editor, enable:

```text
Debug -> Keep Debug Server Open
```

Then start the Electron development app with Godot remote debugging enabled:

```powershell
$env:GODOT_STAGE_REMOTE_DEBUG = "1"
$env:GODOT_STAGE_REMOTE_DEBUG_URI = "tcp://127.0.0.1:6007"
nr dev:tamagotchi
```

`GODOT_STAGE_REMOTE_DEBUG_URI` is optional and defaults to
`tcp://127.0.0.1:6007`, which is Godot's standard local editor debug endpoint.

When Tamagotchi starts the Godot stage, Electron launches the sidecar with
`--remote-debug` before Godot's `--` separator. The sidecar still receives
`--airi-ws-url` after the separator so it can connect back to Electron main.

After selecting a VRM model in the Tamagotchi settings window, inspect the
running scene in the Godot editor:

```text
Scene dock -> Remote -> /root/Node3D/AvatarRoot/Avatar_<modelId>
```

Do not use the editor's Run button for this integration path. The editor-run
process does not receive Electron's `--airi-ws-url`, so it cannot show the model
that Tamagotchi materialized and sent over the sidecar WebSocket.

## Exporting

Export presets produce the sidecar runtime that Electron packages for release:

```bash
godot --headless --export-release "Windows Desktop" build/win/godot-stage.exe
godot --headless --export-release "Linux" build/linux/godot-stage
godot --headless --export-release "macOS" build/mac/godot-stage.app
```

The output directories intentionally match electron-builder's `${os}` names:

- Windows: `build/win`
- Linux: `build/linux`
- macOS: `build/mac`

`apps/stage-tamagotchi/electron-builder.config.ts` copies the matching directory
into `resources/godot-stage` via `extraResources`. To inspect an unpacked
Electron build locally, run:

```bash
pnpm -F @proj-airi/stage-tamagotchi run build:unpack
```

## Notes

### Environment Management

Recommended to use [GodotEnv](https://github.com/chickensoft-games/GodotEnv) to manage Godot versions.

You can use the command below to set current Godot version for this project:

```bash
godotenv godot use 4.6.2
```

Then run the Godot editor with the current project:

```bash
"$(godotenv godot env path)" ./engines/stage-tamagotchi-godot/project.godot
```

You can also run the game directly from the command line:

```bash
"$(godotenv godot env path)" --path ./engines/stage-tamagotchi-godot
```
