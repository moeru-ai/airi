# `@proj-airi/stage-ui-three`

Three.js runtime components and composables used by AIRI stage surfaces.

## What It Does

- Hosts the shared Three scene root used by stage pages.
- Loads and updates VRM models.
- Provides Three-specific hit testing and render-target helpers.
- Exposes a local `trace` submodule for Three/VRM runtime diagnostics.

## When To Use It

- Use it when a stage surface needs a Three-backed renderer.
- Use `@proj-airi/stage-ui-three/trace` when you need Three/VRM runtime telemetry without routing through Vue parent chains.
- Use the trace bus for render/update/load/dispose diagnostics and related devtools.

## When Not To Use It

- Do not use it as a global business event bus.
- Do not use the `trace` submodule for Live2D or non-Three runtime telemetry.
- Do not route renderer-to-main control flow through the `trace` submodule; keep control IPC in the app-level Eventa contracts.

## `trace` Submodule

`@proj-airi/stage-ui-three/trace` provides:

- A local Eventa context for Three/VRM runtime trace events.
- Ref-counted enable/disable controls so hot paths can short-circuit when tracing is off.
- Shared event definitions for:
  - Three render info
  - Three hit-test readback
  - VRM update frame breakdown
  - VRM load / dispose lifecycle events
- Resource snapshot helpers for renderer memory and VRM scene summaries.

The trace bus is intentionally local to `stage-ui-three`. Desktop apps can bridge it across renderer windows when needed, but the source of truth stays in this package.
