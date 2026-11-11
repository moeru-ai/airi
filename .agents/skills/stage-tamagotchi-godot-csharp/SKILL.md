---
name: stage-tamagotchi-godot-csharp
description: >-
  Apply the Stage Tamagotchi Kirie C# conventions when you work on `.cs` files,
  `.csproj` files, Godot scenes, or the local `.editorconfig` in
  `apps/stage-tamagotchi-kirie`. Do not use it for TypeScript, Electron,
  renderer code, or the deprecated `engines/stage-tamagotchi-godot` project.
---

# Stage Tamagotchi Kirie C#

1. Read `apps/stage-tamagotchi-kirie/AGENTS.md`.
2. Read `apps/stage-tamagotchi-kirie/docs/csharp-guide.md`. It is the single source for the C# layout, names, layers, and style.
3. Keep the C# rules inside `apps/stage-tamagotchi-kirie`. Do not move them into the root configuration or other workspaces.
4. After a C# change, run these commands from `apps/stage-tamagotchi-kirie`:

```sh
mise x -- pnpm test:csharp
mise x -- pnpm lint:csharp
```

If a check fails because of files outside your change, report it. Do not widen the change without telling the user.
