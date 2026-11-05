# C# guide

This guide applies to the C# code in `src-godot/` and `tests/`.
[`.editorconfig`](../.editorconfig) holds the formatting rules that `dotnet format` checks.

## Layout

| Path | Content |
| --- | --- |
| `src-godot/app` | The main scene, service composition, and shared helpers |
| `src-godot/contracts` | Eventa payloads and IDs that match `src-web/src/shared/eventa` |
| `src-godot/windows/<window>` | The scene, scene script, manager, and policy code of one native window |
| `src-godot/windows/shared` | Window code that more than one window uses |
| `src-godot/auth`, `src-godot/permissions`, `src-godot/tray` | Services that more than one window uses |
| `tests/StageTamagotchiKirie.Tests` | xUnit tests in folders that mirror `src-godot` |

- Put a new file in the folder of the window or service that owns it.
- When a second owner uses a file, move it to `windows/shared` or `app`.

## Names

- Name each `.cs` file after its main type in PascalCase, for example `ChatWindowManager.cs`.
- Name scenes and other files in kebab-case, for example `chat-window.tscn`.
- When you move or rename a script, keep its `.uid` file next to it.
- When you move a scene or an asset, update its `res://` paths in scenes and C# code.

Godot finds a scene script class by its file name.
The [Godot C# basics](https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/c_sharp_basics.html) require that the file name and the class name match.
All `.cs` files use the same rule, so the repository kebab-case rule does not apply to them.

## Layers

Classify each change before you write code:

| Layer | Content |
| --- | --- |
| Scene script | A `partial` class that extends a Godot node. It has lifecycle methods and scene wiring. |
| Runtime core | Plain C# managers, hosts, coordinators, and policy code |
| Contract | Payload records, Eventa IDs, and JSON contexts |

- Keep scene scripts thin. Move state, protocol handling, and rules into plain C# classes.
- Make pure policy code `static` and test it with xUnit. `FloatingChatPlacement` and `TrayWindowGeometry` are examples.
- Define each boundary as types first. Do not use `Dictionary<string, object?>` or anonymous objects as contracts.
- Use async at I/O and process boundaries only. Do not use it in frame callbacks or to hide ordering problems.
- Use reflection and LINQ only on cold paths, not in frame callbacks or hot loops.

## Style

- Use 4 spaces, LF, UTF-8, and Allman braces.
- When practical, keep lines within 100 columns.
- Put `System.*` usings first. Remove unused usings.
- Use keyword types such as `string` and `int`.
- Use `var` only when the right side shows the type.
- Use `PascalCase` for types and members, `camelCase` for locals and parameters, and `_camelCase` for private fields.
- Keep implicit usings and nullable reference types enabled, as the project files set them.
- Do not add namespaces. The project code uses the global namespace.

## Checks

From the application directory, run:

```sh
mise x -- pnpm test:csharp
mise x -- pnpm lint:csharp
```
