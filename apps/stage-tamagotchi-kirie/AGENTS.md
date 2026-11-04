# Stage Tamagotchi Kirie Agent Guide

This guide covers `apps/stage-tamagotchi-kirie`. The root [AGENTS.md](../../AGENTS.md) still applies.
`engines/stage-tamagotchi-godot` is deprecated. Do not port changes to it or copy code from it.

## Read first

| Task | Read |
| --- | --- |
| Setup, commands, or deferred features | [README.md](README.md) |
| Windows, lifecycle, tray, or Eventa ownership | [docs/host-architecture.md](docs/host-architecture.md) |
| C# code, scenes, or C# tests | [docs/csharp-guide.md](docs/csharp-guide.md) |

## Layout

- `src-web/src` holds the Vue renderer. Kirie has no TypeScript main process.
- `src-web/src/shared/eventa` and `src-godot/contracts` define the same Eventa contracts. Change both in one commit.
- `src-godot/windows/<window>` holds the scene, scene script, and manager of one native window.
- `tests/StageTamagotchiKirie.Tests` mirrors the `src-godot` folders.

## Rules

- Name `.cs` files after their main type in PascalCase. This rule overrides the root kebab-case rule for `.cs` files, because Godot requires it for scene scripts.
- Use kebab-case for all other files, including scenes.
- If a renderer page needs a host capability that Kirie lacks, list it in the README deferred table. Do not add a page that always reports the capability as unavailable.
- If you move a scene, script, or asset, update its `res://` paths and keep its `.uid` and `.import` files next to it.
- Do not add an `install` or `postinstall` script. Put setup steps in `pnpm bootstrap`.

## Checks

From this directory, run the checks for each side that you changed:

```sh
mise x -- pnpm typecheck
mise x -- pnpm test:run
mise x -- pnpm test:csharp
mise x -- pnpm lint:csharp
mise x -- pnpm build
```
