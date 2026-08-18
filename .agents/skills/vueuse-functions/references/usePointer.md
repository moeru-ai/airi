---
category: Sensors
---

# usePointer

Reactive [pointer state](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events).

## Basic Usage

```ts
import { usePointer } from '@vueuse/core'

const { x, y, pressure, pointerType } = usePointer()
```

## Component Usage

By default, the component will track the pointer on `window`

```vue
<template>
  <UsePointer v-slot="{ x, y }">
    x: {{ x }}
    y: {{ y }}
  </UsePointer>
</template>
```

To track local position in the element, set `target="self"`:

```vue
<template>
  <UsePointer v-slot="{ x, y }" target="self">
    x: {{ x }} y: {{ y }}
  </UsePointer>
</template>
```

## Type Declarations

```ts
export interface UsePointerState extends Position {
  pressure: number
  pointerId: number
  tiltX: number
  tiltY: number
  width: number
  height: number
  twist: number
  pointerType: PointerType | null
}
export interface UsePointerOptions extends ConfigurableWindow {
  /**
   * Pointer types that listen to.
   *
   * @default ['mouse', 'touch', 'pen']
   */
  pointerTypes?: PointerType[]
  /**
   * Initial values
   */
  initialValue?: MaybeRef<Partial<UsePointerState>>
  /**
   * @default window
   */
  target?: MaybeRef<EventTarget | null | undefined> | Document | Window
}
export interface UsePointerReturn {
  pressure: Ref<number>
  pointerId: Ref<number>
  tiltX: Ref<number>
  tiltY: Ref<number>
  width: Ref<number>
  height: Ref<number>
  twist: Ref<number>
  pointerType: Ref<PointerType | null>
  x: Ref<number>
  y: Ref<number>
  isInside: ShallowRef<boolean>
}
/**
 * Reactive pointer state.
 *
 * @see https://vueuse.org/usePointer
 * @param options
 */
export declare function usePointer(
  options?: UsePointerOptions,
): UsePointerReturn
```
