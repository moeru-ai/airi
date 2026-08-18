---
category: Elements
---

# useElementBounding

Reactive [bounding box](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect) of an HTML element

## Usage

```vue
<script setup lang="ts">
import { useElementBounding } from '@vueuse/core'
import { useTemplateRef } from 'vue'

const el = useTemplateRef('el')
const { x, y, top, right, bottom, left, width, height } = useElementBounding(el)
</script>

<template>
  <div ref="el" />
</template>
```

## Component Usage

```vue
<template>
  <UseElementBounding v-slot="{ width, height }">
    Width: {{ width }} Height: {{ height }}
  </UseElementBounding>
</template>
```

## Directive Usage

```vue
<script setup lang="ts">
import { vElementBounding } from '@vueuse/components'

interface BoundingType {
  height: number
  bottom: number
  left: number
  right: number
  top: number
  width: number
  x: number
  y: number
}

function onBounding({ height, bottom, left, right, top, width, x, y }: BoundingType) {
  console.log(height, bottom, left, right, top, width, x, y)
}

const options = {
  reset: true,
  windowResize: true,
  windowScroll: true,
  immediate: true,
  updateTiming: 'sync',
}
</script>

<template>
  <textarea v-element-bounding="onBounding" />
  <!-- with options -->
  <textarea v-element-bounding="[onBounding, options]" />
</template>
```

## Type Declarations

```ts
export interface UseElementBoundingOptions {
  /**
   * Reset values to 0 on component unmounted
   *
   * @default true
   */
  reset?: boolean
  /**
   * Listen to window resize event
   *
   * @default true
   */
  windowResize?: boolean
  /**
   * Listen to window scroll event
   *
   * @default true
   */
  windowScroll?: boolean
  /**
   * Immediately call update on component mounted
   *
   * @default true
   */
  immediate?: boolean
  /**
   * Timing to recalculate the bounding box
   *
   * Setting to `next-frame` can be useful when using this together with something like {@link useBreakpoints}
   * and therefore the layout (which influences the bounding box of the observed element) is not updated on the current tick.
   *
   * @default 'sync'
   */
  updateTiming?: "sync" | "next-frame"
}
export interface UseElementBoundingReturn {
  height: ShallowRef<number>
  bottom: ShallowRef<number>
  left: ShallowRef<number>
  right: ShallowRef<number>
  top: ShallowRef<number>
  width: ShallowRef<number>
  x: ShallowRef<number>
  y: ShallowRef<number>
  update: () => void
}
/**
 * Reactive bounding box of an HTML element.
 *
 * @see https://vueuse.org/useElementBounding
 * @param target
 */
export declare function useElementBounding(
  target: MaybeComputedElementRef,
  options?: UseElementBoundingOptions,
): UseElementBoundingReturn
```
