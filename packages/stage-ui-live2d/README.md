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

## Do not use this package

Do not store Character state or cross-window state in this package. Keep that
state in `@proj-airi/stage-ui` and pass the required configuration to the
Live2D context.

Do not use the renderer context as persistent storage. Its state ends when its
owning Vue scope or renderer is disposed.
