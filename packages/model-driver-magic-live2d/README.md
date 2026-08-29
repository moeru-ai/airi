# `@proj-airi/model-driver-magic-live2d`

This package applies MAGIC motion generators to normalized Live2D poses.
It owns pose conversion, fixed-rate scheduling, output filtering, and target release.

## Use the package

```ts
import { createDriver } from '@proj-airi/model-driver-magic-live2d'

const driver = createDriver({
  target: {
    apply: pose => motionControl.setPose(ownerId, pose, dynamics),
    release: () => motionControl.release(ownerId),
  },
})

driver.start(model.toGenerator({ seed: 1 }))
```

The package does not import Vue, Pinia, BroadcastChannel, or a Live2D renderer.
The application supplies the target adapter at the driver seam.
