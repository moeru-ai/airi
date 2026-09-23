---
category: Sensors
---

# useMouse

Reactive mouse position

## Basic Usage

```ts twoslash
import { useMouse } from '@vueuse/core'

const { x, y, sourceType } = useMouse()
```

Touch is enabled by default. To only detect mouse changes, set `touch` to `false`.
The `dragover` event is used to track mouse position while dragging.

```ts twoslash
import { useMouse } from '@vueuse/core'
// ---cut---
const { x, y } = useMouse({ touch: false })
```

## Custom Extractor

It's also possible to provide a custom extractor function to get the position from the event.

```ts twoslash
import type { UseMouseEventExtractor } from '@vueuse/core'
import { useMouse, useParentElement } from '@vueuse/core'

const parentEl = useParentElement()

const extractor: UseMouseEventExtractor = event => (
  event instanceof MouseEvent
    ? [event.offsetX, event.offsetY]
    : null
)

const { x, y, sourceType } = useMouse({ target: parentEl, type: extractor })
```

## Component Usage

```vue
<template>
  <UseMouse v-slot="{ x, y }">
    x: {{ x }}
    y: {{ y }}
  </UseMouse>
</template>
```

## Type Declarations

```ts
export type UseMouseCoordType = "page" | "client" | "screen" | "movement"
export type UseMouseSourceType = "mouse" | "touch" | null
export type UseMouseEventExtractor = (
  event: MouseEvent | Touch,
) => [x: number, y: number] | null | undefined
export interface UseMouseOptions
  extends ConfigurableWindow, ConfigurableEventFilter {
  /**
   * Mouse position based by page, client, screen, or relative to previous position
   *
   * @default 'page'
   */
  type?: UseMouseCoordType | UseMouseEventExtractor
  /**
   * Listen events on `target` element
   *
   * @default 'Window'
   */
  target?: MaybeRefOrGetter<Window | EventTarget | null | undefined>
  /**
   * Listen to `touchmove` events
   *
   * @default true
   */
  touch?: boolean
  /**
   * Listen to `scroll` events on window, only effective on type `page`
   *
   * @default true
   */
  scroll?: boolean
  /**
   * Reset to initial value when `touchend` event fired
   *
   * @default false
   */
  resetOnTouchEnds?: boolean
  /**
   * Initial values
   */
  initialValue?: Position
}
export interface UseMouseReturn {
  x: ShallowRef<number>
  y: ShallowRef<number>
  sourceType: ShallowRef<UseMouseSourceType>
}
/**
 * Reactive mouse position.
 *
 * @see https://vueuse.org/useMouse
 * @param options
 */
export declare function useMouse(options?: UseMouseOptions): UseMouseReturn
```
