# Stage Tamagotchi Godot C# Style

This is a secondary formatting and naming reference.

Read `docs/csharp-development-method.md` first for structure, layering, and
feature-usage guidance. Use this file only for low-level code style.

This profile applies only to `engines/stage-tamagotchi-godot`.

It is a simple C# code-style baseline for this Godot engine. It does not define
runtime structure, nullable policy, namespace policy, or broader architecture
rules.

## Baseline

- Microsoft: Common C# code conventions
- Microsoft: .NET code style rule options
- Godot: C# style guide

## Rules

- Use 4 spaces.
- Use LF line endings.
- Use UTF-8.
- Keep lines at 100 columns when practical.
- Use Allman braces.
- Put `System.*` usings first, then sort the rest alphabetically.
- Prefer C# keyword types such as `string`, `int`, and `bool`.
- Use `var` only when the right-hand side makes the type obvious.
- Use `PascalCase` for types and members.
- Use `camelCase` for locals and parameters.
- Use `_camelCase` for private fields.
- Remove unused `using` directives.
- Remove Godot template comments from touched files.
- Remove empty lifecycle methods from touched files unless they are intentionally kept.
- Keep `using` directives explicit. Do not enable implicit usings for this engine.

## Out of Scope

These are intentionally not decided here:

- Runtime layering and design method
- Nullable reference types
- Namespace strategy
- `record`, `required`, and primary constructors
- DTO or helper-specific style rules

## Verification

When changing C# files or the local `.editorconfig`, verify from the engine
directory with:

```powershell
dotnet format --verify-no-changes
```
