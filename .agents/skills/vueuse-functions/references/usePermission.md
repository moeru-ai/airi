---
category: Browser
---

# usePermission

Reactive [Permissions API](https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API). The Permissions API provides the tools to allow developers to implement a better user experience as far as permissions are concerned.

## Usage

```ts
import { usePermission } from '@vueuse/core'

const microphoneAccess = usePermission('microphone')
```

## Type Declarations

```ts
type DescriptorNamePolyfill =
  | "accelerometer"
  | "accessibility-events"
  | "ambient-light-sensor"
  | "background-sync"
  | "camera"
  | "clipboard-read"
  | "clipboard-write"
  | "gyroscope"
  | "magnetometer"
  | "microphone"
  | "notifications"
  | "payment-handler"
  | "persistent-storage"
  | "push"
  | "speaker"
  | "local-fonts"
export type GeneralPermissionDescriptor =
  | PermissionDescriptor
  | {
      name: DescriptorNamePolyfill
    }
export interface UsePermissionOptions<
  Controls extends boolean,
> extends ConfigurableNavigator {
  /**
   * Expose more controls
   *
   * @default false
   */
  controls?: Controls
}
export type UsePermissionReturn = Readonly<
  ShallowRef<PermissionState | undefined>
>
export interface UsePermissionReturnWithControls extends Supportable {
  state: UsePermissionReturn
  query: () => Promise<PermissionStatus | undefined>
}
/**
 * Reactive Permissions API.
 *
 * @see https://vueuse.org/usePermission
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function usePermission(
  permissionDesc:
    | GeneralPermissionDescriptor
    | GeneralPermissionDescriptor["name"],
  options?: UsePermissionOptions<false>,
): UsePermissionReturn
export declare function usePermission(
  permissionDesc:
    | GeneralPermissionDescriptor
    | GeneralPermissionDescriptor["name"],
  options: UsePermissionOptions<true>,
): UsePermissionReturnWithControls
```
