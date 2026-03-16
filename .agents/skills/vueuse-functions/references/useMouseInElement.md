---
category: Elements
---

# useMouseInElement

Reactive mouse position related to an element

## Usage

```vue
<script setup lang="ts">
import { useMouseInElement } from '@vueuse/core'
import { useTemplateRef } from 'vue'

const target = useTemplateRef('target')

const { x, y, isOutside } = useMouseInElement(target)
</script>

<template>
  <div ref="target">
    <h1>Hello world</h1>
  </div>
</template>
```

## Component Usage

```vue
<template>
  <UseMouseInElement v-slot="{ elementX, elementY, isOutside }">
    x: {{ elementX }}
    y: {{ elementY }}
    Is Outside: {{ isOutside }}
  </UseMouseInElement>
</template>
```

## Directive Usage

```vue
<script setup lang="ts">
import { vMouseInElement } from '@vueuse/components'
import { UseMouseSourceType } from '@vueuse/core'

interface MouseInElementType {
  x: number
  y: number
  sourceType: UseMouseSourceType
  elementX: number
  elementY: number
  elementPositionX: number
  elementPositionY: number
  elementHeight: number
  elementWidth: number
  isOutside: boolean
}

const options = {
  handleOutside: true
}
function onMouseInElement({ x, y, sourceType, elementX, elementY, elementPositionX, elementPositionY, elementHeight, elementWidth, isOutside }: MouseInElementType) {
  console.log(x, y, sourceType, elementX, elementY, elementPositionX, elementPositionY, elementHeight, elementWidth, isOutside)
}
</script>

<template>
  <textarea v-mouse-in-element="onMouseInElement" />
  <!-- with options -->
  <textarea v-mouse-in-element="[onMouseInElement, options]" />
</template>
```

## Type Declarations

```ts
export interface MouseInElementOptions extends UseMouseOptions {
  /**
   * Whether to handle mouse events when the cursor is outside the target element.
   * When enabled, mouse position will continue to be tracked even when outside the element bounds.
   *
   * @default true
   */
  handleOutside?: boolean
  /**
   * Listen to window resize event
   *
   * @default true
   */
  windowScroll?: boolean
  /**
   * Listen to window scroll event
   *
   * @default true
   */
  windowResize?: boolean
}
export interface UseMouseInElementReturn extends UseMouseReturn {
  elementX: ShallowRef<number>
  elementY: ShallowRef<number>
  elementPositionX: ShallowRef<number>
  elementPositionY: ShallowRef<number>
  elementHeight: ShallowRef<number>
  elementWidth: ShallowRef<number>
  isOutside: ShallowRef<boolean>
  stop: () => void
}
/**
 * Reactive mouse position related to an element.
 *
 * @see https://vueuse.org/useMouseInElement
 * @param target
 * @param options
 */
export declare function useMouseInElement(
  target?: MaybeElementRef,
  options?: MouseInElementOptions,
): {
  x: ShallowRef<number>
  y: ShallowRef<number>
  sourceType: ShallowRef<UseMouseSourceType>
  elementX: ShallowRef<number, number>
  elementY: ShallowRef<number, number>
  elementPositionX: ShallowRef<number, number>
  elementPositionY: ShallowRef<number, number>
  elementHeight: ShallowRef<number, number>
  elementWidth: ShallowRef<number, number>
  isOutside: ShallowRef<boolean, boolean>
  stop: () => void
}
```
