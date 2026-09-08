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

`filters/surface-lighting.ts` runs inside the Cubism drawable shaders. It treats the screen as
a finite emitting surface with a flat center behind the character and sides
that curve forward. The default center gap is 4% of the window height. The narrow screen reconstruction supplies linear radiance to 64 tiles.
Each fragment uses its current window position, its normal, the distance to each
tile, and the emitting and receiving angles. A finite tile footprint avoids a
point-light singularity at close range. Distant tiles get weaker through their
solid angle, rather than a separate distance-based blur. `Model.vue` passes the existing ambient state into that binding and
sets the final screen filter's chroma to zero, so the old position-based color
gradient is not applied a second time. The final filter still owns exposure and
silhouette effects. Its rim and inward glow approximate backlight scattering;
it does not add a bloom halo outside the character. The diagnostic test-card preview remains a flat filter
reference; inspect the live model to judge surface lighting.

In Tamagotchi, open **Settings → System → Developer → Live2D Ambient Light**.
The **Virtual screen shape** controls adjust edge bend, screen gap, and flat
center width in the main window. They persist with the other ambient settings.
The default bend is 2; set it to 0 to compare flat lighting. The flat center
starts at 20% of the window height in width. Geometry updates separately from
capture, so adjusting a slider does not restart the screen stream.

Iru uses the reviewed AI normal map in `src/assets/lighting`. The profile stores
neutral reference coordinates, texture UVs, and face drawable assignments. The
map loads only when every drawable ID and texture UV matches at Float32
precision. Other Cubism 4 models use a smooth analytic proxy. They do not inherit
Iru's facial shape. Cubism 2 keeps its existing final filter.

Normal coordinates follow their original mesh vertices during animation.
Light directions use current stage positions, recovered from the Cubism
projection even when Pixi renders into a cropped filter target. The
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
pnpm exec vitest run --config packages/stage-ui-live2d/vitest.config.ts src/filters/surface-irradiance.test.ts src/filters/surface-irradiance.browser.test.ts src/filters/screen-ambient-light.browser.test.ts
```

For actual Cubism pixel checks, import Iru into an isolated desktop profile and
evaluate `docs/research/live2d-lighting-experiment/verify-ambient.js` with
agent-browser. It checks the authored profile on the model with 65 masked drawables,
alpha parity, zero-strength parity, and opposite light directions at three head
poses. The source model and Cubism SDK are local inputs, not bundled test assets.

The screen geometry follows the area-light irradiance integral described in
[Physically Based Rendering](https://pbr-book.org/4ed/Radiometry%2C_Spectra%2C_and_Color/Working_with_Radiometric_Integrals).
This implementation uses finite-tile quadrature, not ray tracing or exact polygon integration.
For a standalone visual check, open `/ambient.html` in the lighting experiment
and evaluate `verify-screen-plane.js`. The preview uses the production material
and final filter with a movable screen patch.

`verify-curved-live.js` checks the live settings-to-renderer path with a frozen
pose and one captured environment. It verifies bend, gap, and center-width
changes through actual GPU pixels, then restores animation and the settings.
The standalone `/ambient-curved.html` comparison remains available.

## Surface lighting diagnostics

The Tamagotchi ambient-light devtool includes a **Surface lighting preview**.
Choose a cylinder to inspect horizontal direction or a sphere to inspect both
axes. **Show surface normals** displays the known normals without lighting.
The main window continues to show the Live2D character for comparison.

The preview uses the same applied contact map, screen geometry, lighting mode,
strength, and chroma as the stage. It uses fixed gray and omits exposure changes,
rim, and wrap. The canvas follows the main window's aspect ratio. Its analytic
normals occupy the same surface plane as Live2D; this is not a depth or
self-shadowing simulation. The existing test card remains for final-filter checks.

`SurfaceLightPreviewFilter` imports the production irradiance shader directly.
The preview has no animation loop; it renders on diagnostics or control changes
and releases its context on unmount. Its browser tests cover side direction,
frontal light from curved emitters, shape silhouettes, and the normals view.
