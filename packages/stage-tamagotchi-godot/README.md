# `@proj-airi/stage-tamagotchi-godot`

Godot-native desktop stage runtime project for `stage-tamagotchi`.

## What It Does

- Hosts the Godot project used as the desktop-only stage runtime baseline.
- Provides the minimal scene, script, and .NET project structure for G0 stage work.
- Keeps Godot-owned assets, scenes, scripts, and future add-ons local to one workspace package.

## What It Is Not

- It is not the Electron host app.
- It does not own AIRI agent logic or adaptation-layer IPC contracts.
- It is not a web or mobile renderer package.

## Current Scope

- Desktop-only Godot sidecar runtime exploration for `stage-tamagotchi`.
- Godot C# project structure and minimal runtime skeleton.
- Early-stage scene and runtime validation work.

## Directory Layout

- `scenes/`: Godot scene files such as the current stage root.
- `scripts/`: C# runtime scripts attached to Godot nodes.
- `assets/`: Imported models, textures, materials, and other runtime assets.
- `addons/`: Godot plugins, editor/runtime add-ons, or vendored third-party Godot extensions.

## When To Use It

- Use it when working on the Godot-backed desktop stage runtime.
- Use it for Godot scene, asset, rendering, and character-runtime work.
- Use it as the package boundary for the desktop Godot stage project itself.

## When Not To Use It

- Do not put Electron main/renderer host logic here.
- Do not put AIRI agent orchestration or cross-process protocol definitions here.
- Do not use it as a generic cross-platform stage abstraction package.

## Build

- `pnpm -F @proj-airi/stage-tamagotchi-godot build`
- `pnpm -F @proj-airi/stage-tamagotchi-godot typecheck`

Both commands currently run `dotnet build` against the Godot-generated C# project file.

## Notes

### Environment Management

Recommended to use [GodotEnv](https://github.com/chickensoft-games/GodotEnv) to manage Godot versions.

You can use the command below to set current Godot version for this project:

```bash
godotenv godot use 4.6.2
```

Then run the Godot editor with the current project:

```bash
"$(godotenv godot env path)" ./packages/stage-tamagotchi-godot/project.godot
```

You can also run the game directly from the command line:

```bash
"$(godotenv godot env path)" --path ./packages/stage-tamagotchi-godot
```
