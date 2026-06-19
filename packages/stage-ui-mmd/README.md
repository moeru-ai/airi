# @proj-airi/stage-ui-mmd

MMD (MikuMikuDance) scene components, composables, and stores for Project AIRI.

## What it does

Renders PMX/PMD models with VMD/VPD motion support inside AIRI's stage,
reaching feature parity with the Live2D and VRM renderers:

- **Model loading** for `.pmx`/`.pmd`, from a packaged ZIP (model + textures)
  or a bare model URL.
- **Physics** for hair, skirts, and custom rigs via Bullet (Ammo.js) — rigid
  bodies and 6-DOF spring joints, toggleable at runtime.
- **IK** (CCD solver) and **append-bone ("grant")** propagation for standard
  and custom rigs.
- **Importable, mappable motions**: register VMD clips by name and map AIRI
  emotions to gesture motions, layered over a persistent idle loop.
- **Morph-based lip-sync** driven by the shared wLipSync profile, mapping
  phonemes to the canonical あいうえお mouth morphs.
- **Emotion expressions** via morph cross-fades.
- **Eye gaze + head aim** (cursor tracking) with idle saccades, plus
  procedural blink.

It builds on [`three-stdlib`](https://github.com/pmndrs/three-stdlib) (the
maintained TypeScript port of three.js' `examples/jsm`) for `MMDLoader`,
`MMDAnimationHelper`, `MMDPhysics`, and `CCDIKSolver`, because upstream three
removed the first-party MMD modules in r168. Physics uses `ammojs-typed`,
loaded lazily so the WASM binary only ships once an MMD model is mounted.

## How to use

The package exposes the same scene contract as the other renderers, so it is
wired through `@proj-airi/stage-ui`'s `Stage.vue` automatically when the
selected model resolves to the `mmd` renderer:

```ts
import { MMDScene, useMMD } from '@proj-airi/stage-ui-mmd'
```

```vue
<MMDScene
  v-model:state="state"
  :model-src="modelUrl"
  :cursor-position="cursorPosition"
  :current-audio-source="audioSource"
  :enable-orbit-controls="true"
  @error="onError"
/>
```

The component exposes `canvasElement()`, `captureFrame()`,
`setEmotion(name, intensity)`, `listMorphs()`, and `listMotions()`.

Runtime configuration (physics/IK/grant toggles, gaze tracking, scale,
morph overrides, emotion→motion mapping) lives in the `useMMD` Pinia store and
is edited through the model settings panel.

## When to use it

- Displaying MMD/MikuMikuDance characters (`.pmx`/`.pmd`) on the AIRI stage.
- When you need physics-driven secondary motion, IK, and VMD playback.

## When not to use it

- For VRM avatars use `@proj-airi/stage-ui-three`; for Live2D use
  `@proj-airi/stage-ui-live2d`; for Spine use `@proj-airi/stage-ui-spine`.
- In environments without WebGL/WASM support (MMD physics requires Ammo WASM).
