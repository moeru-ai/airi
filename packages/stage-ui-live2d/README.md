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
gradient is not applied a second time. Ambient exposure and contrast apply before
direct surface light, so reducing ambient fill does not dim the added highlights.
**Chroma** also reduces ambient color channels absent from the received screen
light. This artistic color cast follows surface normals and fades with light
energy; unlit surfaces retain their ambient color. A neutral screen stays neutral.
The final filter retains silhouette effects. Its rim and inward glow approximate
backlight scattering. **Backlight bloom** adds an exterior halo; set it to zero
to preserve the original silhouette alpha. The diagnostic test-card preview remains a flat filter
reference; inspect the live model to judge surface lighting.

In Tamagotchi, open **Settings → System → Developer → Live2D Ambient Light**.
The **Virtual screen shape** controls adjust edge bend, screen gap, and flat
center width in the main window. They persist with the other ambient settings.
The default bend is 2; set it to 0 to compare flat lighting. The flat center
starts at 20% of the window height in width. Geometry updates separately from
capture, so adjusting a slider does not restart the screen stream.

Under **Shader response**, **Surface sheen** controls broad reflections of the
screen color, independent of the painted albedo. **Nose relief** adjusts the small
nose reflection; zero removes it without changing diffuse face shading.
**Soft highlights** compresses added light with one shared RGB factor, preserving
the source color as reflections brighten. The nose follows its painted highlight mesh's deformation and
retains the face drawable ownership and alpha bounds. These controls update the live
model without changing or regenerating its normal-map image.

**Illustrated materials** uses reviewed hair and face assignments. Hair reflects
light through GGX with fixed dielectric reflectance 0.046. **Hair roughness**
defaults to 0.70 and changes reflection width without changing the normal field.
**Face light relief** defaults to 1. The face uses a fitted height field with
cheeks, a tapered chin, and a small nose. Local surface slopes produce a light
gradient and an unlit region under side light. Zero blends the entire face back
to one diffuse direction. The nose keeps
its narrow highlight; clothing receives no added sheen in illustrated mode.
Disable the toggle to compare the previous Blinn-Phong material.

**Face turn angle** rotates the fitted face and nose normals with Iru's head X
parameter. The default is 20 degrees at the rig's maximum head turn. Zero
restores the previous directions. This calibration is independent of surface
relief: a flat face still turns toward or away from a light. Core parameters
are read on every draw, including frames without a new screen sample. The nose
bump and reflection use a separate transform from the painted nose mesh. This
keeps the highlight on the nose when its rig moves farther than the cheek mesh.
The transform also follows the nose position during pitch and roll; normal
orientation still uses the calibrated head yaw.

This combines physical hair reflection with artistic diffuse and silhouette
responses. It is not full PBR. **Hair shadow on face** defaults to zero because
Iru's artwork already contains painted hair shadows. If enabled, it projects coverage from
five reviewed foreground hair meshes onto a fitted convex face. The coverage
pass uses current vertices, atlas alpha, visibility, and render order. Each
screen emitter projects its own shadow; ambient fill remains visible.

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

This is approximate relighting of shaded artwork. Hair normals remain in the
neutral coordinate basis. The fitted face follows head yaw, but pitch, roll,
and cast-shadow depth do not yet use a full 3D pose. This renderer does
not remove baked shadows or reconstruct hidden geometry. The optional hair shadows
use a fitted depth proxy, so large head rotations remain approximate.

In illustrated mode, the nose reflection has a broad angular response inside
its small face-bound mask. This keeps the accent visible under oblique light
without adding reflection to the rest of the face. Optional hair shadows block it.

Each model binding owns its GPU buffers and textures. Model replacement and
unmount dispose it; context restoration rebuilds those resources. Assets and
reference buffers have fixed dimensions and do not depend on window size.

## Verification

Run the focused final-filter GPU tests with Vitest using this package's config:

```sh
pnpm exec vitest run --config packages/stage-ui-live2d/vitest.config.ts src/filters/surface-irradiance.test.ts src/filters/surface-irradiance.browser.test.ts src/filters/screen-ambient-light.browser.test.ts src/filters/surface-light-preview.browser.test.ts src/filters/surface-material.browser.test.ts
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

`verify-curved-face-live.js` captures both side-light directions at three head
poses on the live Cubism model. It compares the old face-wide blend against full
local relief on the same fitted surface, with added hair shadows off. It checks
alpha parity and the compiled shader, then restores the renderer and animation.
Its bright test patches are controlled fixtures, not desktop capture samples.

`/concept.html` compares the previous material against nose relief, sheen, soft
highlights, and exposure before direct light under a fixed warm screen patch.
`verify-concept.js` checks nose locality at three head angles, unchanged alpha,
and exact artwork parity at zero strength. Its controlled light does not replace
the desktop capture. The material GPU tests cover reflection color, ambient-fill
independence, back rejection, highlight compression, and zero strength.

## Surface lighting diagnostics

The Tamagotchi ambient-light devtool includes a **Surface lighting preview**.
Choose a cylinder to inspect horizontal direction or a sphere to inspect both
axes. **Show surface normals** displays the known normals without lighting.
The main window continues to show the Live2D character for comparison.

The preview uses the same applied contact map, screen geometry, lighting mode,
strength, chroma, illustrated material, roughness, sheen, and soft highlights as the stage. It uses fixed gray and omits exposure changes,
rim, and wrap. The canvas follows the main window's aspect ratio. Its analytic
normals occupy the same surface plane as Live2D; this is not a depth or
self-shadowing simulation. The existing test card remains for final-filter checks.

`SurfaceLightPreviewFilter` imports the production irradiance shader directly.
The preview has no animation loop; it renders on diagnostics or control changes
and releases its context on unmount. Its browser tests cover side direction,
frontal light from curved emitters, shape silhouettes, and the normals view.

`verify-nose-registration-live.js` checks the reflection against the painted
nose center under two light directions, three horizontal turns, and two vertical
turns. It checks alpha parity and restores the material, light, pose, and
animation. The unit fixture records the actual nose vertices at three head angles.
