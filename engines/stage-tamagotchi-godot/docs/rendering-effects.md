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

- `StageRenderEffectsRuntime` wires the stage-level overlay and compositor
  owners for the active camera and loaded avatar.
- `StageMaterialOverlayOwner` records render-effect source claims and assigns
  the shared avatar mask overlay material. The overlay depth-tests against the
  scene and writes stencil reference `1` without writing scene depth.
- `StagePostProcessCompositorEffect` always owns the final NAES/toon color
  mapping stage. Its internal pipeline currently runs scene copy, avatar glow,
  and final color mapping in that order.
- When avatar glow is active, it extracts bright source from the stencil-marked
  scene color, diffuses it, and composites avatar glare into the HDR input
  consumed by final color mapping.
- The vendored V-Sekai MToon shader remains responsible for the avatar's base
  material look.

Current implementation details:

- `StageCompositorOwner` owns the active `Camera3D` compositor slot and registers
  the stage post-process compositor effect without feature runtimes replacing
  the camera compositor independently.
- `StageMaterialOverlayOwner` owns `GeometryInstance3D.MaterialOverlay` writes
  for stage render-effect source passes.
- The compositor effect owns its transient post-process textures. It uses Godot's
  `FramebufferCacheRD` and `UniformSetCacheRD` for derived framebuffer and
  uniform-set RIDs, while texture ownership stays local to the stage
  post-process pass graph.
- The final NAES/toon color mapping is a separate compositor stage and no
  longer depends on avatar glow being enabled. Later source effects can feed the
  same final color stage before display output after same-scene visual
  comparison.
- Godot Environment Glow is disabled in `StageVisualPreset`; avatar-style glow
  source selection comes from the shared stencil overlay, not from material
  emission.

## Why Overlay First

`MaterialOverlay` is instance-local and renders an additional material over the
same geometry. It can add semantic render data without replacing the imported
MToon material.

Use overlay first when an effect can be represented as an extra whole-geometry
pass:

- stencil or object-mask tagging;
- avatar mask selection for glow and future avatar-only effects;
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
  effects must go through `StageMaterialOverlayOwner` instead of assigning it
  independently.
- `Camera3D.Compositor` is also a single owner slot. Additional post effects
  must be registered through the stage compositor owner instead of independently
  replacing the camera compositor.
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
- The current final color mapping still lives inside the stage post-process
  compositor, but it is an independently enabled stage, not a glow sub-pass.

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
