---
category: Browser
---

# useBluetooth

Reactive [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API). Provides the ability to connect and interact with Bluetooth Low Energy peripherals.

The Web Bluetooth API lets websites discover and communicate with devices over the Bluetooth 4 wireless standard using the Generic Attribute Profile (GATT).

N.B. It is currently partially implemented in Android M, Chrome OS, Mac, and Windows 10. For a full overview of browser compatibility please see [Web Bluetooth API Browser Compatibility](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API#browser_compatibility)

N.B. There are a number of caveats to be aware of with the web bluetooth API specification. Please refer to the [Web Bluetooth W3C Draft Report](https://webbluetoothcg.github.io/web-bluetooth/) for numerous caveats around device detection and connection.

N.B. This API is not available in Web Workers (not exposed via WorkerNavigator).

## Usage Default

```vue
<script setup lang="ts">
import { useBluetooth } from '@vueuse/core'

const {
  isSupported,
  isConnected,
  device,
  requestDevice,
  server,
  error,
} = useBluetooth({
  acceptAllDevices: true,
})
</script>

<template>
  <button @click="requestDevice()">
    Request Bluetooth Device
  </button>
  <div v-if="error">
    Error: {{ error }}
  </div>
</template>
```

### Return Values

| Property        | Type                             | Description                                |
| --------------- | -------------------------------- | ------------------------------------------ |
| `isSupported`   | `ComputedRef<boolean>`           | Whether the Web Bluetooth API is supported |
| `isConnected`   | `Ref<boolean>`                   | Whether a device is currently connected    |
| `device`        | `Ref<BluetoothDevice>`           | The connected Bluetooth device             |
| `server`        | `Ref<BluetoothRemoteGATTServer>` | The GATT server for the connected device   |
| `error`         | `Ref<unknown>`                   | Any error that occurred during connection  |
| `requestDevice` | `() => Promise<void>`            | Function to request a Bluetooth device     |

When the device has paired and is connected, you can then work with the server object as you wish.

## Usage Battery Level Example

This sample illustrates the use of the Web Bluetooth API to read battery level and be notified of changes from a nearby Bluetooth Device advertising Battery information with Bluetooth Low Energy.

Here, we use the characteristicvaluechanged event listener to handle reading battery level characteristic value. This event listener will optionally handle upcoming notifications as well.

```vue
<script setup lang="ts">
import { useBluetooth, useEventListener, watchPausable } from '@vueuse/core'

const {
  isSupported,
  isConnected,
  device,
  requestDevice,
  server,
} = useBluetooth({
  acceptAllDevices: true,
  optionalServices: [
    'battery_service',
  ],
})

const batteryPercent = ref<undefined | number>()

const isGettingBatteryLevels = ref(false)

async function getBatteryLevels() {
  isGettingBatteryLevels.value = true

  // Get the battery service:
  const batteryService = await server.getPrimaryService('battery_service')

  // Get the current battery level
  const batteryLevelCharacteristic = await batteryService.getCharacteristic(
    'battery_level',
  )

  // Listen to when characteristic value changes on `characteristicvaluechanged` event:
  useEventListener(batteryLevelCharacteristic, 'characteristicvaluechanged', (event) => {
    batteryPercent.value = event.target.value.getUint8(0)
  }, { passive: true })

  // Convert received buffer to number:
  const batteryLevel = await batteryLevelCharacteristic.readValue()

  batteryPercent.value = await batteryLevel.getUint8(0)
}

const { stop } = watchPausable(isConnected, (newIsConnected) => {
  if (!newIsConnected || !server.value || isGettingBatteryLevels.value)
    return
  // Attempt to get the battery levels of the device:
  getBatteryLevels()
  // We only want to run this on the initial connection, as we will use an event listener to handle updates:
  stop()
})
</script>

<template>
  <button @click="requestDevice()">
    Request Bluetooth Device
  </button>
</template>
```

More samples can be found on [Google Chrome's Web Bluetooth Samples](https://googlechrome.github.io/samples/web-bluetooth/).

## Type Declarations

```ts
export interface UseBluetoothRequestDeviceOptions {
  /**
   *
   * An array of BluetoothScanFilters. This filter consists of an array
   * of BluetoothServiceUUIDs, a name parameter, and a namePrefix parameter.
   *
   */
  filters?: BluetoothLEScanFilter[] | undefined
  /**
   *
   * An array of BluetoothServiceUUIDs.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/BluetoothRemoteGATTService/uuid
   *
   */
  optionalServices?: BluetoothServiceUUID[] | undefined
}
export interface UseBluetoothOptions
  extends UseBluetoothRequestDeviceOptions, ConfigurableNavigator {
  /**
   *
   * A boolean value indicating that the requesting script can accept all Bluetooth
   * devices. The default is false.
   *
   * !! This may result in a bunch of unrelated devices being shown
   * in the chooser and energy being wasted as there are no filters.
   *
   *
   * Use it with caution.
   *
   * @default false
   *
   */
  acceptAllDevices?: boolean
}
export declare function useBluetooth(
  options?: UseBluetoothOptions,
): UseBluetoothReturn
export interface UseBluetoothReturn extends Supportable {
  isConnected: Readonly<ShallowRef<boolean>>
  device: ShallowRef<BluetoothDevice | undefined>
  requestDevice: () => Promise<void>
  server: ShallowRef<BluetoothRemoteGATTServer | undefined>
  error: ShallowRef<unknown | null>
}
```
