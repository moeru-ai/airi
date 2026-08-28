# `@proj-airi/input-gamepad`

This package reads controllers through the browser Gamepad API. It accepts controllers that expose the W3C `standard` mapping.

The package converts browser button indices to physical names. For example, button `0` becomes `faceBottom`. The printed label can be `×`, `A`, or `B`.

## Use the package

```ts
import { StandardGamepadMonitor } from '@proj-airi/input-gamepad'

const monitor = new StandardGamepadMonitor({ deadzone: 0.12 })
const stopListening = monitor.onSnapshot((snapshot) => {
  if (!snapshot)
    return

  console.info(snapshot.leftStick, snapshot.buttons.faceBottom)
})

monitor.start()

// Run these operations when the feature closes.
stopListening()
monitor.stop()
```

## When to use it

Use this package directly in framework-independent browser code. It supports buttons, sticks, and analog triggers.

In Vue code, use `@proj-airi/input-gamepad-vueuse`. It owns the polling lifecycle and exposes readonly reactive state.

Do not use this package for motion sensors, touchpads, lights, or adaptive triggers. Use a device-specific adapter for these features.

The package ignores controllers without the `standard` mapping. This rule prevents device-specific button indices from entering application code.
