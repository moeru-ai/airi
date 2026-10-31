# Live2D motion layers

Status: proposed

## Context

Motion sources write to one Live2D model without a clear owner for each part of the pose. Two bugs came from that:

- **The model did not return to the center.** `pixi-live2d-display` keeps a focus target in `FocusController`. After the motion update, `updateFocus()` adds the target to `ParamAngleX`, `ParamAngleY`, `ParamAngleZ`, `ParamBodyAngleX`, and the eye balls on every frame. AIRI set the target only while it tracked the cursor or ran the idle eye focus. When the user turned off both mouse tracking and idle eye movement, the last target stayed, so the model stayed turned. A MAGIC pose got the same turn on top. `Live2DModel.focus()` also puts the target on the unit circle, so the cursor sentinel `{ x: 1000, y: 1000 }` turned the head to the lower right.
- **The web settings preview did not move with MAGIC.** Only `Stage.vue` ran the MAGIC driver and broadcast its poses. The web settings route unmounts the stage, so the preview had no driver. On desktop the main window broadcast to the settings window, so the bug did not show there.

## Decision

### The focus target has one owner in each mode

`resolveLive2DFocusTargetMode` selects one of three modes:

| Mode | When | Effect |
| --- | --- | --- |
| `follow` | Mouse tracking is on for the universal driver, and a cursor position arrived in the last second | `Live2DModel.focus(cursor)` |
| `idle` | Idle eye movement is on | The idle eye focus plugin moves the target |
| `center` | Otherwise, including every MAGIC frame | `focusController.focus(0, 0)`. The controller eases to the center. |

### MAGIC runs in each renderer and keeps its poses local

`useLive2DStageMotionMagic` owns the activation of one MAGIC driver. `Stage.vue` and the settings preview both use it. The driver publishes with `setPose(owner, pose, dynamics, { broadcast: false })`. Each window then moves its own model, and two windows cannot replace the poses of each other. The devtools joystick still broadcasts, and its exclusive claim still pauses every driver.

## Consequences

- Turning off mouse tracking and idle eye movement centers the model, for both drivers.
- Each window that shows the character runs its own MAGIC driver. With the settings window open on desktop, two drivers run. Each costs one fit and a 30 Hz generator.
