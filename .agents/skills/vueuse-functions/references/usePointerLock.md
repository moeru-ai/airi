---
category: Sensors
---

# usePointerLock

Reactive [pointer lock](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API).

## Basic Usage

```ts
import { usePointerLock } from '@vueuse/core'

const {
  isSupported,
  lock,
  unlock,
  element,
  triggerElement
} = usePointerLock()
```

## Component Usage

```vue
<template>
  <UsePointerLock v-slot="{ lock }">
    <canvas />
    <button @click="lock">
      Lock Pointer on Canvas
    </button>
  </UsePointerLock>
</template>
```

## Type Declarations

```ts
export interface UsePointerLockOptions extends ConfigurableDocument {}
export interface UsePointerLockReturn extends Supportable {
  element: ShallowRef<MaybeElement>
  triggerElement: ShallowRef<MaybeElement>
  lock: (e: MaybeElementRef | Event) => Promise<MaybeElement>
  unlock: () => Promise<boolean>
}
/**
 * Reactive pointer lock.
 *
 * @see https://vueuse.org/usePointerLock
 * @param target
 * @param options
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function usePointerLock(
  target?: MaybeElementRef,
  options?: UsePointerLockOptions,
): UsePointerLockReturn
```
