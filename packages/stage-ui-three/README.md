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

## Scene Lifecycle

`ThreeScene` coordinates two independent async readiness signals before the scene becomes interactive:

- **VRM load**: `VRMModel` emits `sceneBootstrap` (geometry data) then `loaded` once the model is committed into the scene.
- **Controls init**: `OrbitControls` emits `orbitControlsReady` once it has obtained the camera and renderer references.

These two signals are coordinated through a binding transaction tracked in `useModelStore`:

- `scenePhase`: the current phase of the scene — `pending` → `loading` → `binding` → `mounted` (or `error` / `no-model`).
- `sceneTransactionDepth`: incremented at the start of a load or rebind cycle, decremented when binding completes. The scene is considered mid-flight whenever depth > 0.
- `sceneMutationLocked`: computed from `scenePhase` and `sceneTransactionDepth`. True whenever the scene is not yet mounted or a transaction is in progress. Used to gate user interactions like orbit controls.

When either signal arrives, `ThreeScene` calls `completeSceneBinding()`. That function:

1. Sets `scenePhase` to `'binding'` immediately to block premature `mounted` resolution.
2. Applies the pending `SceneBootstrap` payload (camera position, model origin, eye height, etc.) if one exists.
3. Calls `controlsRef.update()` after a `nextTick` so OrbitControls reads the updated camera state.
4. Resolves `scenePhase` to its final value based on current `modelPhase` and `canvasReady`.

Whichever signal arrives second completes the binding. The first signal to arrive finds the other not yet ready and resolves back to `'loading'`.

### Camera Preservation on Model Switch

`SceneBootstrap` carries a `cacheHit` flag. `ThreeScene.applySceneBootstrap` uses the transaction reason to decide how to apply bootstrap data:

- `initial-load` / `unknown`: camera position and target are reset to the model's computed defaults.
- `model-switch`: the user's existing camera offset and look-at angle relative to the previous model origin are preserved and projected onto the new model origin.

### Subtree Watch

`ThreeScene` watches `modelRef` and `controlsRef` with `flush: 'sync'` to detect immediate detach events within the same tick. When `controlsRef` goes null (e.g. TresJS internal remount), `controlsReady` resets and a new binding transaction opens. When `modelRef` goes null, `scenePhase` reverts to `loading` without opening a new transaction, since the next `loadStart` event from `VRMModel` will open one.

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
