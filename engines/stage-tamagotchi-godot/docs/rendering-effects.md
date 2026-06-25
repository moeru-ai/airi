# Rendering Effect Placement

This note records the current design direction for custom stage rendering
effects. The goal is to keep vendored MToon shaders stable unless an effect
truly needs to participate in base material shading.

## Current Direction

Prefer this split for avatar and stage visual effects:

```text
MToon / base material
  Owns the avatar's normal toon shading and material response.

GeometryInstance3D.MaterialOverlay
  Owns non-invasive per-mesh auxiliary passes, such as stencil, mask, ID, or
  simple extra visual sources.

CompositorEffect
  Owns same-frame screen-space work, such as glow diffusion, compositing, and
  final custom color mapping before display output.
```

For avatar glow, this means:

- `StageAvatarGlowRuntime` marks avatar meshes with an overlay material that
  depth-tests against the scene and writes stencil reference `1` without writing
  scene depth.
- `StageAvatarGlowCompositorEffect` reads the stencil-marked scene color,
  extracts the glow source, diffuses it, composites it, and applies the current
  toon color mapping.
- The vendored V-Sekai MToon shader remains responsible for the avatar's base
  material look.

Current implementation details:

- `StageAvatarGlowRuntime` currently assigns a new `Compositor` directly to the
  active `Camera3D`. This is acceptable while avatar glow is the only stage
  compositor, but multiple camera effects need a shared compositor owner.
- `StageAvatarGlowCompositorEffect` currently owns both avatar glow and the
  stage toon color mapping. That is an implementation coupling, not the desired
  long-term feature boundary.
- The effect owns its transient bloom textures. It uses Godot's
  `FramebufferCacheRD` and `UniformSetCacheRD` for derived framebuffer and
  uniform-set RIDs, while texture ownership stays local to the effect until a
  shared post-process resource context exists.
- Godot Environment Glow is disabled in `StageVisualPreset`; avatar-style glow
  source selection comes from the stencil overlay, not from material emission.

## Why Overlay First

`MaterialOverlay` is instance-local and renders an additional material over the
same geometry. It can add semantic render data without replacing the imported
MToon material.

Use overlay first when an effect can be represented as an extra whole-geometry
pass:

- stencil or object-mask tagging;
- avatar-only glow source selection;
- silhouette, outline, selection, or interaction masks;
- depth-tested x-ray or rim/shell source passes;
- temporary verification passes that should not mutate imported materials.

This avoids patching every vendored MToon shader variant for effects that do
not belong to the material's base shading model.

## Where Overlay Stops

Overlay is not a general replacement for shader ownership.

Do not rely on overlay alone when the effect needs to change the base material
result before post-processing:

- MToon ramp, shade color, or lighting response;
- shadow attenuation or direct-light behavior;
- normal-dependent toon bands inside the material;
- texture-driven or UV-driven per-surface masks unavailable to the overlay
  pass;
- skin, hair, cloth, or accessory behavior that must differ inside one imported
  mesh.

Those cases need an owned shader contract, an importer/material patch, or extra
authoring data that the overlay pass can read.

## Known Constraints

- `MaterialOverlay` is a single slot on each `GeometryInstance3D`. Multiple
  effects cannot assign it independently without an owner that arbitrates the
  slot.
- `Camera3D.Compositor` is also a single owner slot in the current stage code.
  Additional post effects should be registered through a shared compositor owner
  instead of independently replacing the camera compositor.
- The overlay material applies to the whole geometry and all surfaces unless
  the mesh is split or the overlay shader has reliable mask data.
- Overlay adds draw work for every marked geometry. This is acceptable for the
  current avatar path, but it should be measured before expanding it to many
  scene objects.
- Transparent occluders may not block overlay-derived masks when they do not
  write depth. Opaque depth-tested occluders should block the current avatar
  glow stencil source.
- Screen-space diffusion, blur pyramids, and color mapping still belong in a
  same-frame compositor. Overlay should produce source information, not replace
  the compositor pass graph.
- The current color mapping is tied to `StageAvatarGlowCompositorEffect`.
  Splitting color mapping into a stage-level post-process pass should happen
  together with the next multi-effect refactor.

## Decision Rule

Use the least invasive layer that has the data and timing required by the
effect:

1. Use MToon or an owned material shader when the effect changes base material
   shading.
2. Use `MaterialOverlay` when the effect only needs an extra per-mesh pass or
   semantic mask.
3. Use `CompositorEffect` when the effect needs same-frame screen-space image
   processing.

Patch vendored MToon only when the required behavior cannot be expressed as an
overlay source plus compositor work.
