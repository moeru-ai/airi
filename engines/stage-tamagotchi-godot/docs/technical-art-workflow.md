# Technical Art Visual Workflow

This workflow exists for renderer and Technical Art work where visual judgment
is part of correctness. It is specifically written for the Godot stage runtime.

## Required Evidence

Every renderer-facing change needs comparable evidence before it can be
accepted:

1. Reference evidence.
   Use screenshots, Blender captures, shader references, or shipped-game
   examples. Record the camera, model, active feature state, and what visual
   property the reference is meant to prove.
2. Before/after AIRI evidence.
   Capture the current AIRI output before and after changing the renderer when
   the question depends on a visual difference.
3. Pipeline evidence.
   Capture the relevant intermediate render stages when debugging compositor or
   material pipeline behavior. Do not rely on memory or a manually inspected
   live viewport alone.

The current render-stage dump command is:

```powershell
pnpm -F @proj-airi/stage-tamagotchi-godot dump:render-stages
```

For rim or edge-light shape checks, prefer the upper-body camera preset:

```powershell
pnpm -F @proj-airi/stage-tamagotchi-godot dump:render-stages:upper-body
```

The dump is end-to-end: it launches the real main stage, loads the tracked
avatar through the WebSocket host path, and captures the visible Godot window
client area. Internal viewport texture readback is not acceptable as final
renderer evidence because it can bypass the final display conversion and
produce darker, higher-contrast PNGs than the actual window.

The command writes:

```text
engines/stage-tamagotchi-godot/artifacts/render-stages/
```

The upper-body variant writes:

```text
engines/stage-tamagotchi-godot/artifacts/render-stages-upper-body/
```

Default outputs are:

- `scene-copy.png`
- `avatar-mask.png`
- `avatar-edge-mask.png`
- `after-avatar-edge-light.png`
- `after-avatar-glow.png`
- `final.png`
- `final-edge-off.png`

These are diagnostic outputs, not accepted baselines. Use them to locate the
first divergent stage before changing the next stage.

This workflow intentionally does not define a project-wide visual baseline yet.
If visual baselines are added later, they need a separate design for scope,
fixture ownership, feature-specific acceptance, and update policy.

## Work Order

1. Define the visual question.
   Write the narrow question first: color mapping parity, avatar-only glow,
   rim-light shape, outline width, alpha sorting, or another specific property.
   Do not start from an implementation idea.

2. Choose the reference and fixture.
   Use a tracked fixture when the result should stay reproducible from the
   repository. Use a private fixture only for temporary research, and record the
   path and limitation in the working notes.

3. Capture the current output.
   Dump the relevant render stages and keep the artifact path in the working
   notes or PR context. For refactors, this is the behavior that must remain
   visually stable.

4. Make one renderer change.
   Keep the change aligned to one pipeline stage or one material/source owner
   decision. A refactor and a new visual effect should not be accepted in the
   same comparison unless there is an explicit reason.

5. Compare before judging.
   Dump the same scene after the change and compare the relevant artifacts
   before changing code again.

6. Classify the difference.
   Put the difference into one bucket before fixing:
   - expected visual change
   - expected drift caused by the intended change
   - regression in an unrelated visual property
   - capture instability
   - fixture or camera mismatch

7. Record the acceptance.
   If the image changes intentionally, record why and keep the artifact path. If
   the code change is supposed to preserve behavior, compare the before/after
   artifacts and document the result.

## Debug Rules

- Start from the rendered artifact, not from a shader guess.
- Use final window output for visual acceptance. `GetViewport().GetTexture()`
  readback is only an intermediate diagnostic and must not become the accepted
  final evidence for color, contrast, glow, rim light, or tone-mapping
  judgments.
- Compare the same model, camera, viewport size, and frame timing.
- For pipeline work, identify the stage that first diverges before modifying the
  next stage.
- For reference-driven compositor work, compare the reference stage output and
  Godot stage output side by side. Do not accept the final image until the
  intermediate mask and after-stage image explain the final difference.
- For material work, inspect imported material parameters before changing the
  post-process shader.
- For color issues, separate scene color, source mask, glow composite, and final
  color mapping. Do not merge these explanations into one cause.
- If three local fixes do not explain the visual difference, stop and re-check
  the pipeline ownership model before adding another patch.

## Gate For Edge Light Work

Edge light work can start only after these are true:

1. Current render-stage artifacts exist and have been manually inspected.
2. Refactor-only changes have matching before/after output for the relevant
   views.
3. The reference case has a documented camera and enabled/disabled comparison.
4. The planned edge-light implementation is behind a toggle or stage boundary so
   feature-off output can still be captured and compared.
5. Xiaoer reference stages and Godot render stages have been dumped for the same
   visual question: edge mask, after-edge image, and final enabled/disabled
   comparison.

This avoids repeating the previous failure mode: changing rendering architecture
and a new visual effect at the same time without proving same-scene parity.
