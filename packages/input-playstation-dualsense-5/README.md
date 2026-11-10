# `@proj-airi/input-playstation-dualsense-5`

This package reads and writes Sony PlayStation 5 DualSense reports through WebHID. It has no UI code.

The package supports the standard DualSense controller with product ID `0x0ce6`. It supports USB and Bluetooth reports.

## Use the package

Call `requestDualSenseDevice()` from a user action. WebHID requires a user action before it shows the device chooser.

```ts
import {
  createDefaultDualSenseOutputState,
  DualSenseController,
  requestDualSenseDevice,
} from '@proj-airi/input-playstation-dualsense-5'

const device = await requestDualSenseDevice()
if (!device)
  throw new Error('No DualSense device was selected.')

const controller = new DualSenseController(device)
const stopInput = controller.onInputReport((report) => {
  console.info(report.state.sticks.left)
})

await controller.open()

const output = createDefaultDualSenseOutputState()
await controller.sendOutput({
  ...output,
  lightbar: { red: 124, green: 178, blue: 232 },
})

stopInput()
await controller.close()
```

Use `getGrantedDualSenseDevices()` to find devices that already have permission. Use `onDualSenseConnectionChange()` to observe connect and disconnect events.

## When to use it

Use this package when a Chromium renderer needs raw DualSense input, motion sensors, touch points, LEDs, rumble, or adaptive triggers.

Do not use this package for a generic gamepad. Use the Gamepad API when standard buttons and axes are sufficient.

WebHID requires a secure context. The host browser must support WebHID.

## Reference

- https://github.com/nondebug/dualsense
