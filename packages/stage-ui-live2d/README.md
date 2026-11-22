# `@proj-airi/stage-ui-live2d`

This package provides the Live2D renderer, Vue components, and runtime APIs for
Project AIRI. Each `Live2DRoot` owns one isolated renderer context.

## Use this package

Use `Live2DScene` when a Stage surface needs a complete Live2D renderer. Pass a
`Live2DContext` when the parent must inspect or control that renderer.

Use the context APIs for expression and motion registration. Character-owned
control policies select which registered controls AIRI can use.

```ts
import { createLive2D } from '@proj-airi/stage-ui-live2d'

const live2d = createLive2D({
  controlPolicy: () => characterAvatarModel.config.controls,
})

await live2d.expressions.execute({ name: 'happy', duration: 3 })
await live2d.motions.execute('motions/wave.motion3.json')
```

## Motion layers

`Live2DScene` combines several motion sources on one model.

- The focus target of Pixi follows the cursor, follows the idle eye focus, or goes back to the center.
  `resolveLive2DFocusTargetMode` selects the mode.
- A manual pose, for example a MAGIC pose, comes from `useLive2DMotionControl`. Pass
  `{ broadcast: false }` to `setPose` for a source that runs in each renderer.
- With `focusBias`, the scene biases a manual pose toward the cursor. `createLive2DFocusBias` owns the fade and the gains.
  The head turns part of the way, and the eyes cover the rest. The generated motion continues under the bias.
- A tap or a pat on the canvas plays a reaction from `createLive2DTouchReaction`, and the scene emits `touch`.
  `Model.touchAt` resolves the head or the body from the author hit areas, the head box, or the drawable bounds.

## Model input mapping

The model settings offer two control mappings: AIRI default and Model configuration.
If the default mapping cannot control an imported model, select Model configuration.
Both mappings keep the existing Cubism physics evaluation.

ZIP and directory imports read the `.vtube.json` beside the selected `.model3.json` with the same file stem.
The supported inputs cover head angles, eye direction, eye opening, mouth opening, and mouth shape.
Bindings preserve configured ranges, reversal, clamping, and multiple targets for one signal.
The selected mapping belongs to the model and defaults to AIRI default.

AIRI controls write to the configured inputs before physics runs.
Physics destinations reachable from these inputs retain control of their output parameters.
Authored motions and expressions keep their original parameter IDs.
With model mapping, expressions apply after mapped inputs and before physics, so expression overrides retain their priority.
Mapped writes occur after SDK parameter saving, so SDK restoration prevents feedback between frames.

Missing or invalid mappings cannot activate model routing. Unmapped controls retain the default mapping.
Direct URL imports do not discover unreferenced sidecars.
AIRI keeps its own motion smoothing and does not reproduce external tracking, VBridger, or VTube Studio auto-blink settings.
The settings report partial support when a file contains unsupported inputs or options.

## Do not use this package

Do not store Character state or cross-window state in this package. Keep that
state in `@proj-airi/stage-ui` and pass the required configuration to the
Live2D context.

Do not use the renderer context as persistent storage. Its state ends when its
owning Vue scope or renderer is disposed.
