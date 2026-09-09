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
that curve forward. The default center gap is 11% of the full character height. The narrow screen reconstruction supplies linear radiance to 64 tiles.
Each fragment uses its current window position, its normal, the distance to each
tile, and the emitting and receiving angles. A finite tile footprint avoids a
point-light singularity at close range. Distant tiles get weaker through their
solid angle, rather than a separate distance-based blur. `Model.vue` passes the existing ambient state into that binding and
sets the final screen filter's chroma to zero, so the old position-based color
gradient is not applied a second time. Ambient exposure and contrast apply before
direct surface light, so reducing ambient fill does not dim the added highlights.
**Chroma** controls the screen light's color contribution. **Dim-light color
boost** amplifies its perceptual color shift while preserving lit luminance.
Each RGB channel stays at or above the current baseline; neutral light stays neutral.
The final filter retains silhouette effects. Its rim and inward glow approximate
backlight scattering. **Backlight bloom** blurs a separate light-only surface draw
into an exterior halo. Normals, material response, shadows, and individual screen
emitters determine its energy. Unlit artwork and ambient fill contribute none.
The draw and blur run at half resolution and only when bloom is enabled. Set it to zero
to preserve the original silhouette alpha. The diagnostic test-card preview remains a flat filter
reference; inspect the live model to judge surface lighting.

In Tamagotchi, open **Settings → System → Developer → Live2D Ambient Light**.
The **Virtual screen shape** controls adjust edge bend, screen gap, and flat
center width in the main window. They persist with the other ambient settings.
The default bend is 5; set it to 0 to compare flat lighting. The flat center
starts at 42% of the full character height in width. Geometry updates separately from
capture, so adjusting a slider does not restart the screen stream.

Under **Shader response**, **Surface sheen** controls broad reflections of the
screen color, independent of the painted albedo. **Nose relief** adjusts the small
nose reflection; zero removes it without changing diffuse face shading.
**Soft highlights** compresses added light with one shared RGB factor, preserving
the source color as reflections brighten. The nose follows its painted highlight mesh's deformation and
retains the face drawable ownership and alpha bounds. These controls update the live
model without changing or regenerating its normal-map image.

### Brightness and eye adaptation trial

The devtool's **Try linear screen lighting** switch is enabled in the default
preset. The trial applies only to directional surface lighting. The automatic
baseline follows the smoothed full-display mean luminance with a tunable power
curve: `dark + (bright - dark) * mean^curve`. The preset uses dark 0.11, bright 1,
and curve 2. Disable the automatic baseline to use steady **Base brightness**.
**Exposure range** is unused in this mode. Screen pixels remain linear RGB.
**Screen white luminance** defaults to 450 nits and scales emission relative to
a 200-nit reference. Capture does not measure physical nits.
**Exposure compensation** applies stops after room and direct surface lighting.
A shared RGB shoulder above 0.6 rolls off highlights while preserving midtones.
The existing illustrated materials and color cast remain artistic approximations.

**Adaptive bloom** meters the surrounding light map and averages its luminance
in stops over time. Its exponential moving mean has separate time constants:
0.5 seconds toward darkness and 0.2 seconds toward brightness by default.
The automatic baseline uses the same time constants with a separate linear mean.
This increases halo sensitivity after darkness and suppresses it on a sustained
bright screen. Sustained bright pages also reduce inward silhouette glare. The
halo gain applies after highlight compression so that strong bloom settings do
not hide the reduction. Received surface light supplies the directional model's halo energy;
black produces none. Camera exposure stays fixed while the automatic baseline
follows the smoothed screen mean. These timings approximate a visual
effect, not the full physiology of human dark adaptation.

On macOS, a ScreenCaptureKit helper excludes the AIRI stage window in the
compositor. The captured display includes the desktop beneath the character,
so moving a light behind its silhouette does not discard that light. The
screen-gap transport supplies spatial falloff; no additional silhouette mask
or feathering removes incoming light. The helper scales directly to the sample
grid and retains only the latest frame. This avoids video-canvas downscaling
and character-alpha GPU readback in the renderer.

Other desktop platforms use the video capture path. It excludes nonzero
character and bloom alpha, retains 500 ms of coverage, and expands the mask by
two sample cells. This prevents feedback but cannot recover hidden sources.

The final filter owns the transient history and shares it with the surface
binding. Render calls advance it without extra timers or capture uploads.
Disabling the trial resets history; a render gap over two seconds seeds the
current reading. History is neither persisted nor synchronized between windows.
The cylinder and flat test-card previews retain their separate diagnostic response;
judge this trial on the live model.

`verify-exposure-live.js` captures matched saved, linear, and adapted results.
`verify-adaptation-live.js` holds local illumination fixed while stepping the
recent-surround meter through bright/dark transitions. Both scripts live in
`docs/research/live2d-lighting-experiment` and restore live state afterward.

The trial follows the separation of physical light and exposure in
[Filament](https://google.github.io/filament/main/filament.html) and the separate
bright/dark adaptation speeds in
[Unreal Engine](https://dev.epicgames.com/documentation/unreal-engine/auto-exposure-in-unreal-engine).

### Experimental per-model normals

The ambient-light devtool has an **Model lighting** panel.
It checks the active model and existing attachment without running inference.
**Generate for current model** captures a separate neutral rig, runs local
Marigold, saves the attachment, and binds it to the live model. **Regenerate and
overwrite** replaces that model's saved result. The panel shows the neutral
capture, normal map, reference coverage, fingerprint, timestamp, and active binding.

Attachments live in a separate IndexedDB database, `airi-live2d-lighting`.
Each record stores image blobs and its drawable reference together. A SHA-256
fingerprint covers the rig bytes and ordered texture contents. Renaming or
repacking identical assets reuses the attachment. Original model files stay unchanged.
Loading a model applies an existing compatible attachment but never starts generation.

**Export lighting ZIP** downloads `profile.json`, `normal.png`, `neutral.png`,
`ownership.png`, and `coverage.png`. It also includes `raw-normal.png` when present.
The profile retains the fingerprint, drawable topology, generator metadata, and
reviewed face, nose, yaw, and illustrated material bindings. It contains relative
image names and excludes model files and machine paths.

On another installation, load the same model and choose **Import lighting ZIP**.
The devtool validates the schema, image dimensions, fingerprint, and rig topology
before replacing that model's saved attachment. Import needs no inference runtime.
A different model is rejected. Moving or renaming identical model assets is valid.
Keep private bundles outside Git, for example in `lighting-private.local/`.

Closing the devtool cancels its active inference job. Model changes reject stale
results. Failed inference leaves the previous saved attachment intact.

The capture uses Cubism's alpha and clipping masks to record drawable ownership.
Visible neutral regions follow their mesh vertices during animation. Newly exposed
regions use the analytic proxy. This first experiment uses raw Marigold normals;
it does not infer semantic face/hair assignments or reviewed nose geometry.
Reference positions deform, but normal vectors still use the neutral coordinate basis.

The Electron worker uses a host-owned Python process, cached weights, and no shell
or network access. Development uses the existing research environment under
`docs/research/live2d-lighting-experiment`. Other installations can set
`AIRI_NORMAL_PYTHON` to a Python executable with PyTorch, Diffusers, NumPy, and Pillow,
and `AIRI_NORMAL_WEIGHTS` to the Hugging Face cache containing the pinned checkpoint.
Runtime installation and weight downloads are not part of this experiment.

### Illustrated materials

**Illustrated materials** uses reviewed hair and face assignments. Hair reflects
light through GGX with fixed dielectric reflectance 0.046. **Hair roughness**
defaults to 0.70 and changes reflection width without changing the normal field.
**Face light relief** defaults to 0.8. The face uses a fitted height field with
cheeks, a tapered chin, and a small nose. Local surface slopes produce a light
gradient and an unlit region under side light. Zero blends the entire face back
to one diffuse direction. The nose keeps
its narrow highlight; clothing receives no added sheen in illustrated mode.
Disable the toggle to compare the previous Blinn-Phong material.

**Face turn angle** rotates the fitted face and nose normals with the attachment's yaw
parameter. The default is 45 degrees at the rig's maximum head turn. Zero
restores the previous directions. This calibration is independent of surface
relief: a flat face still turns toward or away from a light. Core parameters
are read on every draw, including frames without a new screen sample. The nose
bump and reflection use a separate transform from the painted nose mesh. This
keeps the highlight on the nose when its rig moves farther than the cheek mesh.
The transform also follows the nose position during pitch and roll; normal
orientation still uses the calibrated head yaw.

This combines physical hair reflection with artistic diffuse and silhouette
responses. It is not full PBR. **Hair shadow on face** defaults to 0.5 in the saved
preset; zero retains only the artwork's painted shadows. If enabled, it projects coverage from
the reviewed foreground hair meshes onto a fitted convex face. The coverage
pass uses current vertices, atlas alpha, visibility, and render order. Each
screen emitter projects its own shadow; ambient fill remains visible.

No character-specific maps or mesh bindings ship with the renderer. Import a
standalone lighting ZIP from the desktop Ambient Light devtool. Until a matching
attachment is installed, each model uses the analytic proxy. Cubism 2 keeps its
existing final filter.

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

For actual Cubism checks, use an isolated desktop profile and a local model.
Import its lighting ZIP in the Ambient Light devtool, export it, then reload the
model and import the exported ZIP. Check the fingerprint, saved binding, images,
and rendered character. Import a different model's ZIP and confirm rejection.
Source models and private lighting bundles are local inputs, not test assets.

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

### Area tile comparison

The devtool's **Virtual screen shape → Try area light tiles** switch selects
cached area lighting for both the character and surface preview. It is enabled
by default; disable it to compare the point-tile response.

The surface samples an 8 by 8 grid over the full captured display. Capture stores
this emission separately from the local contact and surround maps used for glow.
Native capture excludes the AIRI window and retains the screen beneath it.
For captures that include AIRI, masked character pixels are excluded and holes
inside the display are filled. Sampling averages linear RGB without saturation
weighting; black pixels contribute their actual area.
No emitting tiles exist beyond the display edge.

The current drawn ArtMesh bounds define the character's center and height before viewport clipping.
Screen positions come from the canvas rectangle on the physical display. Empty
window margins cancel from the geometry; moving or scaling the character changes
its distance from each source. Gap and curvature use full character heights. Cropping the model cannot change the lighting geometry.

The trial uses the same source-color grid for point and area modes. Adjacent tiles share their
boundaries on the curved screen. Each tile contributes its cosine-weighted
solid angle, clipped at the receiving normal's horizon. This removes separate
diffuse lobes from uniform screen regions without blurring the artwork.

Screen gap controls the physical spread. For parallel emitter and receiver
planes, the transport kernel is `K(r, d) = d² / (π (r² + d²)²)`, where `d` is
the perpendicular gap and `r` is the offset along the screen. Nearby sources
remain localized; distant sources blend across a wider region. The polygon
integral also accounts for tilted surfaces and receiving-horizon clipping.

Finite screen boundaries lose energy without renormalization. Source RGB reaches
the integral without an extra blur or saturation weighting. The local contact
and surround blurs remain separate artistic glow inputs. Color boost remains a
later effect. No independent diffusion coefficient overrides the screen geometry.

`SurfaceLightField` combines diffuse light and broad reflections in a 272 by 288
atlas. The atlas stores 16 by 16 positions over the full character bounds, 17 by 9 normal samples, and two
response layers. Its RGBA8 allocation is about 306 KiB. Square-root encoding
preserves dim colors; interpolation approximates the spatial and angular response.
Screen and character-bound updates refresh the atlas at most 20 times per second. Geometry settings, roughness,
and renderer-context changes refresh on the next draw.

The character still samples its current normal and position at full resolution.
Nose highlights, cloth accents, and illustrated hair below roughness 0.5 retain
the original reflection calculation. Optional animated face shadows use their
current RGB transmission ratio to attenuate cached diffuse light. This ratio
approximates shadowed area light; it does not repeat the polygon integrals.

The Lambertian area response bypasses the hair's old diffuse shaping curve.
Exposure, color strength, material masks, and bloom remain outside the cache.
The cache interpolates lighting and can soften small source details. It does not
reconstruct depth or remove the point approximation from specular light sources.

Live profiling at 960 by 1178 pixels measured 86.9 FPS and 5.7 ms mean GPU time
for the cache, with animation, capture, bloom, and face shadows active. Controls
in the same session measured 46.8 FPS / 13.4 ms for point tiles and
19.5 FPS / 41.5 ms for uncached area tiles. These live results depend on screen
content and other GPU work. See
`docs/research/live2d-lighting-experiment/cached-area-result.md` for evidence.
