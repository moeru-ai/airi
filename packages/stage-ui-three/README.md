# `@proj-airi/stage-ui-three`

Three.js runtime components, stores, composables, and diagnostics used by AIRI stage surfaces.

## What It Does

- Hosts the shared Three scene root used by stage pages.
- Loads, mounts, reuses, and disposes VRM models.
- Exposes a package-local model store for camera, light, environment, and model view state.
- Provides Three-specific hit testing, render-target helpers, and VRM preview generation.
- Exposes a local `trace` submodule for Three/VRM runtime diagnostics.

## Exports

- `ThreeScene`: the main Three-backed stage component.
- `useModelStore`: Pinia store for Three scene and model configuration.
- `@proj-airi/stage-ui-three/trace`: local Eventa trace bus and snapshot helpers.
- `@proj-airi/stage-ui-three/composables/vrm`: VRM loading and animation helpers.
- `@proj-airi/stage-ui-three/utils/vrm-preview`: one-off VRM preview rendering.
- `composables/hit-test` and `composables/render-target`: renderer readback helpers.

## VRM Lifecycle

VRM runtime management is explicit in this package.

- `VRMModel.vue` drives load, commit, and cleanup separately instead of relying on component remounts as the primary lifecycle.
- Detached VRM instances are cached through `components/Model/vrm-instance-cache.ts` as `ManagedVrmInstance` values.
- Cache entries are scoped by `scopeKey` and matched by `modelSrc` before reuse.
- Component unmount may stash the current instance for reuse.
- Model switch clears the active instance and any detached cache for the current scope.
- Fresh loads prepare the next VRM off-screen, then commit it into the active scene once ready.

This keeps ordinary remounts and HMR from immediately forcing deep VRM disposal, while still making model switches deterministic.

## `trace` Submodule

`@proj-airi/stage-ui-three/trace` provides:

- A local Eventa context for Three/VRM runtime trace events.
- Ref-counted enable/disable controls so hot paths can short-circuit when tracing is off.
- Shared event definitions for:
  - Three render info
  - Three hit-test readback
  - VRM update frame breakdown
  - VRM load start / end / error
  - VRM dispose start / end
- Resource snapshot helpers for renderer memory and VRM scene summaries.

The trace bus is intentionally local to `stage-ui-three`. Desktop apps can bridge it across renderer windows when needed, but the source of truth stays in this package.

## When To Use It

- Use it when a stage surface needs a Three-backed renderer.
- Use `useModelStore` when the page needs to control camera, lighting, model transforms, or renderer-facing state.
- Use `@proj-airi/stage-ui-three/trace` when you need Three/VRM runtime telemetry without routing through Vue parent chains.
- Use `utils/vrm-preview` for isolated preview rendering that should not participate in the main stage lifecycle.

## When Not To Use It

- Do not use it as a global business event bus.
- Do not use the `trace` submodule for Live2D or non-Three runtime telemetry.
- Do not route renderer-to-main control flow through the `trace` submodule; keep control IPC in app-level contracts.
- Do not use the VRM instance cache as a general shared asset cache across apps or windows.
