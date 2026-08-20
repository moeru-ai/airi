---
category: Sensors
---

# useNetwork

Reactive [Network status](https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API). The Network Information API provides information about the system's connection in terms of general connection type (e.g., 'wifi', 'cellular', etc.). This can be used to select high definition content or low definition content based on the user's connection. The entire API consists of the addition of the NetworkInformation interface and a single property to the Navigator interface: Navigator.connection.

## Usage

```ts
import { useNetwork } from '@vueuse/core'

const { isOnline, offlineAt, downlink, downlinkMax, effectiveType, saveData, type } = useNetwork()

console.log(isOnline.value)
```

To use as an object, wrap it with `reactive()`

```ts
import { useNetwork } from '@vueuse/core'
// ---cut---
import { reactive } from 'vue'

const network = reactive(useNetwork())

console.log(network.isOnline)
```

## Component Usage

```vue
<template>
  <UseNetwork v-slot="{ isOnline, type }">
    Is Online: {{ isOnline }}
    Type: {{ type }}
  </UseNetwork>
</template>
```

## Type Declarations

```ts
export interface UseNetworkOptions extends ConfigurableWindow {}
export type NetworkType =
  | "bluetooth"
  | "cellular"
  | "ethernet"
  | "none"
  | "wifi"
  | "wimax"
  | "other"
  | "unknown"
export type NetworkEffectiveType = "slow-2g" | "2g" | "3g" | "4g" | undefined
export interface NetworkState extends Supportable {
  /**
   * If the user is currently connected.
   */
  isOnline: Readonly<ShallowRef<boolean>>
  /**
   * The time since the user was last connected.
   */
  offlineAt: Readonly<ShallowRef<number | undefined>>
  /**
   * At this time, if the user is offline and reconnects
   */
  onlineAt: Readonly<ShallowRef<number | undefined>>
  /**
   * The download speed in Mbps.
   */
  downlink: Readonly<ShallowRef<number | undefined>>
  /**
   * The max reachable download speed in Mbps.
   */
  downlinkMax: Readonly<ShallowRef<number | undefined>>
  /**
   * The detected effective speed type.
   */
  effectiveType: Readonly<ShallowRef<NetworkEffectiveType | undefined>>
  /**
   * The estimated effective round-trip time of the current connection.
   */
  rtt: Readonly<ShallowRef<number | undefined>>
  /**
   * If the user activated data saver mode.
   */
  saveData: Readonly<ShallowRef<boolean | undefined>>
  /**
   * The detected connection/network type.
   */
  type: Readonly<ShallowRef<NetworkType>>
}
export type UseNetworkReturn = Readonly<NetworkState>
/**
 * Reactive Network status.
 *
 * @see https://vueuse.org/useNetwork
 * @param options
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useNetwork(
  options?: UseNetworkOptions,
): UseNetworkReturn
```
