---
category: Browser
---

# useWakeLock

Reactive [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API). Provides a way to prevent devices from dimming or locking the screen when an application needs to keep running.

## Usage

```ts
import { useWakeLock } from '@vueuse/core'

const { isSupported, isActive, forceRequest, request, release } = useWakeLock()
```

When `request` is called, the wake lock will be requested if the document is visible. Otherwise, the request will be queued until the document becomes visible. If the request is successful, `isActive` will be **true**. Whenever the document is hidden, the `isActive` will be **false**.

When `release` is called, the wake lock will be released. If there is a queued request, it will be canceled.

To request a wake lock immediately, even if the document is hidden, use `forceRequest`. Note that this may throw an error if the document is hidden.

## Type Declarations

```ts
type WakeLockType = "screen"
export interface WakeLockSentinel extends EventTarget {
  type: WakeLockType
  released: boolean
  release: () => Promise<void>
}
export type UseWakeLockOptions = ConfigurableNavigator & ConfigurableDocument
export interface UseWakeLockReturn extends Supportable {
  sentinel: ShallowRef<WakeLockSentinel | null>
  isActive: ComputedRef<boolean>
  request: (type: WakeLockType) => Promise<void>
  forceRequest: (type: WakeLockType) => Promise<void>
  release: () => Promise<void>
}
/**
 * Reactive Screen Wake Lock API.
 *
 * @see https://vueuse.org/useWakeLock
 * @param options
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useWakeLock(
  options?: UseWakeLockOptions,
): UseWakeLockReturn
```
