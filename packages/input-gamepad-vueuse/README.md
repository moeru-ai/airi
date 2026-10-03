# `@proj-airi/input-gamepad-vueuse`

This package provides Vue composables for `@proj-airi/input-gamepad`.
It owns the monitor lifecycle and exposes readonly reactive controller state.

## Use the package

```ts
import { useStandardGamepad } from '@proj-airi/input-gamepad-vueuse'
import { whenever } from '@vueuse/core'
import { watchEffect } from 'vue'

const gamepad = useStandardGamepad()

whenever(gamepad.buttons.faceBottom, () => {
  console.info('The bottom face button is pressed.')
})

whenever(gamepad.pressed('leftShoulder', 'dpadLeft'), () => {
  console.info('The shortcut is pressed.')
})

watchEffect(() => {
  console.info(gamepad.sticks.left.value, gamepad.values.rightTrigger.value)
})
```

The composable starts after its Vue scope mounts. It stops when that scope is disposed.
Use `pause()` and `resume()` when a mounted feature must stop input temporarily.

## When to use it

Use this package in Vue browser and Electron renderer code.
Use `@proj-airi/input-gamepad` in framework-independent code.

This package exposes standard buttons, sticks, and analog triggers.
It does not expose motion sensors, touchpads, lights, or adaptive triggers.
Use a device-specific package for these features.
