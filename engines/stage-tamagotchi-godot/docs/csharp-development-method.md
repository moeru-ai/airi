# Stage Tamagotchi Godot C# Development Method

This guide applies only to `engines/stage-tamagotchi-godot`.

It defines how C# code in this Godot engine should be structured and how modern
C# features should be used. Formatting and naming rules are secondary and live
in the local `.editorconfig` plus `docs/csharp-style.md`.

## 1. Scope

Use this guide for:

- Godot scene scripts
- runtime coordinators and controllers
- host-stage transport contracts
- registry and discovery code
- tooling and editor-support code inside this engine

Do not treat this guide as a repo-wide C# standard.

## 2. Layer Model

Split engine C# code into these layers before writing implementation:

1. Scene Script
   - Godot-owned `Node` or `Node3D` partial classes
   - lifecycle entrypoints and scene binding
2. Runtime Core
   - plain C# runtime logic
   - controllers, coordinators, state holders, services
3. Contract and Transport
   - message types
   - settings snapshots
   - ready, fatal, shutdown, and state-update payloads
4. Registry and Discovery
   - descriptors
   - startup-time discovery
   - catalogues and lookup tables
5. Tooling and Editor Support
   - inspector-facing helpers
   - import/export helpers
   - debug or editor-only data assembly

Do not collapse these responsibilities into a single Godot script by default.

## 3. Scene Script Rules

Scene scripts should stay thin.

Use scene scripts for:

- Godot lifecycle entrypoints such as `_Ready`
- node lookup and scene wiring
- handing control to runtime objects
- bridging Godot callbacks into explicit runtime code

Avoid putting these directly into scene scripts unless the code is trivial:

- transport protocol handling
- registry construction
- complex state transitions
- business or gameplay rules
- large data transformation pipelines

If a scene script starts owning lifecycle, runtime state, protocol handling, and
tool configuration at once, split the code.

## 4. Runtime Core Rules

Put durable runtime logic into plain C# objects first.

Prefer:

- small coordinators over large all-knowing classes
- explicit state objects over hidden mutable flags
- constructor or method injection of dependencies
- clear call flow over implicit control transfer

Runtime core code should be easy to trace in a debugger. Favor explicit maps,
state, and control flow over clever abstraction.

## 5. Contract and Transport Rules

Make cross-boundary communication type-driven.

Prefer explicit types for:

- transport messages
- payloads
- settings snapshots
- descriptors
- registry entries
- runtime state snapshots

Avoid:

- `Dictionary<string, object?>` as a default contract shape
- magic-string protocols spread across files
- anonymous objects crossing subsystem boundaries
- comments standing in for real type definitions

The rule is simple: define the boundary as types first, then implement the
transport around those types.

## 6. Reflection and LINQ Policy

Reflection is for discovery, not execution.

Good uses of reflection:

- startup-time module discovery
- attribute metadata reading
- descriptor generation
- editor or tooling support

Do not use reflection for:

- per-frame logic
- runtime hot-path dispatch
- core state-machine execution
- repeated dynamic invocation in steady-state runtime

LINQ is for cold-path querying and data shaping.

Good uses of LINQ:

- building registries
- filtering descriptors
- configuration projection
- debug or tooling views

Avoid heavy LINQ in hot paths, per-frame loops, or repeatedly executed runtime
queries when an explicit index or dictionary would be clearer and cheaper.

Use this mental model:

- reflection builds the catalogue
- LINQ shapes and queries the catalogue
- runtime executes through explicit structures

## 7. Async Boundary Policy

Use async at I/O and process boundaries.

Good async boundaries:

- socket and transport setup
- file I/O
- host-side process interaction
- startup loading that is naturally asynchronous

Avoid pushing async into:

- per-frame updates
- core runtime loops
- timing-sensitive behavior that should stay explicit

Do not use async to hide lifecycle or ordering problems.

## 8. Deferred Decisions

These items are intentionally deferred and should not be guessed:

- nullable reference type rollout policy
- namespace strategy
- `record` usage boundaries
- `required` member usage boundaries
- primary constructor usage boundaries
- helper-layer versus scene-script feature allowances

When one of these becomes relevant, decide it explicitly and add it to the
engine-local guidance instead of inferring it from style tools.
