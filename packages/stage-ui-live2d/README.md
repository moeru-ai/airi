# Live2D stage

This package owns the Pixi/Cubism stage, model controls, and Live2D lighting.
Import the scene from `@proj-airi/stage-ui-live2d/components/scenes/Live2D.vue`.
Use it for Cubism models; VRM and other renderers have separate packages.

## Screen ambient lighting

Enable **Screen ambient light** in the desktop settings. **Surface lighting**
uses the captured screen's linear RGB environment to illuminate model normals.
**Global** applies a uniform color response. The existing strength, chroma,
exposure, contrast, wrap, and backlight controls remain available. Forced color
is useful for checking the effect without screen capture.

`filters/surface-lighting.ts` runs inside the Cubism drawable shaders. It groups
the measured environment into nine area lights and computes their diffuse
response. `Model.vue` passes the existing ambient state into that binding and
sets the final screen filter's chroma to zero, so the old position-based color
gradient is not applied a second time. The final filter still owns exposure and
silhouette effects. The diagnostic test-card preview remains a flat filter
reference; inspect the live model to judge surface lighting.

Iru uses the reviewed AI normal map in `src/assets/lighting`. The profile stores
neutral reference coordinates, texture UVs, and face drawable assignments. The
map loads only when every drawable ID and texture UV matches at Float32
precision. Other Cubism 4 models use a smooth analytic proxy. They do not inherit
Iru's facial shape. Cubism 2 keeps its existing final filter.

Normal coordinates follow their original mesh vertices during animation. The
face correction is restricted to its assigned drawables, and the saved ownership
map prevents an occluded layer from borrowing the visible layer's normal.
Coverage is interpolated across each texel edge without blending encoded IDs.
Multiply shadows and additive effects keep their authored blend operations.
Color alpha, Cubism masks, and render order remain SDK-owned.

This is approximate relighting of shaded artwork. Normal vectors remain in the
neutral coordinate basis; they do not rotate as a true 3D surface would. It does
not remove baked shadows, reconstruct hidden geometry, or cast new shadows.

Each model binding owns its GPU buffers and textures. Model replacement and
unmount dispose it; context restoration rebuilds those resources. Assets and
reference buffers have fixed dimensions and do not depend on window size.

## Verification

Run the focused final-filter GPU tests with Vitest using this package's config:

```sh
pnpm exec vitest run --config packages/stage-ui-live2d/vitest.config.ts src/filters/screen-ambient-light.browser.test.ts
```

For actual Cubism pixel checks, import Iru into an isolated desktop profile and
evaluate `docs/research/live2d-lighting-experiment/verify-ambient.js` with
agent-browser. It checks the authored profile on the model with 65 masked drawables,
alpha parity, zero-strength parity, and opposite light directions at three head
poses. The source model and Cubism SDK are local inputs, not bundled test assets.
