---
category: Sensors
---

# useBattery

Reactive [Battery Status API](https://developer.mozilla.org/en-US/docs/Web/API/Battery_Status_API), more often referred to as the Battery API, provides information about the system's battery charge level and lets you be notified by events that are sent when the battery level or charging status change. This can be used to adjust your app's resource usage to reduce battery drain when the battery is low, or to save changes before the battery runs out in order to prevent data loss.

## Usage

```ts
import { useBattery } from '@vueuse/core'

const { isSupported, charging, chargingTime, dischargingTime, level } = useBattery()
```

| State           | Type      | Description                                                       |
| --------------- | --------- | ----------------------------------------------------------------- |
| isSupported     | `Boolean` | If the Battery Status API is supported in the current browser.    |
| charging        | `Boolean` | If the device is currently charging.                              |
| chargingTime    | `Number`  | The number of seconds until the device becomes fully charged.     |
| dischargingTime | `Number`  | The number of seconds before the device becomes fully discharged. |
| level           | `Number`  | A number between 0 and 1 representing the current charge level.   |

::: warning Browser Support
The Battery Status API has limited browser support. It is currently only available in Chromium-based browsers. Always check `isSupported` before using the values.
:::

## Use-cases

Our applications normally are not empathetic to battery level, we can make a few adjustments to our applications that will be more friendly to low battery users.

- Trigger a special "dark-mode" battery saver theme settings.
- Stop auto playing videos in news feeds.
- Disable some background workers that are not critical.
- Limit network calls and reduce CPU/Memory consumption.

## Component Usage

```vue
<template>
  <UseBattery v-slot="{ isSupported, charging, level }">
    <div v-if="isSupported">
      <p>Is Charging: {{ charging }}</p>
      <p>Battery Level: {{ (level * 100).toFixed(0) }}%</p>
    </div>
    <div v-else>
      Battery API not supported
    </div>
  </UseBattery>
</template>
```

## Type Declarations

```ts
export interface UseBatteryOptions extends ConfigurableNavigator {}
export interface UseBatteryReturn extends Supportable {
  charging: ShallowRef<boolean>
  chargingTime: ShallowRef<number>
  dischargingTime: ShallowRef<number>
  level: ShallowRef<number>
}
export interface BatteryManager extends EventTarget {
  charging: boolean
  chargingTime: number
  dischargingTime: number
  level: number
}
/**
 * Reactive Battery Status API.
 *
 * @see https://vueuse.org/useBattery
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useBattery(
  options?: UseBatteryOptions,
): UseBatteryReturn
```
