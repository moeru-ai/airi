---
category: Elements
---

# useElementSize

Reactive size of an HTML element. [ResizeObserver MDN](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)

## Usage

```vue
<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { useTemplateRef } from 'vue'

const el = useTemplateRef('el')
const { width, height } = useElementSize(el)
</script>

<template>
  <div ref="el">
    Height: {{ height }}
    Width: {{ width }}
  </div>
</template>
```

## Component Usage

```vue
<template>
  <UseElementSize v-slot="{ width, height }">
    Width: {{ width }} Height: {{ height }}
  </UseElementSize>
</template>
```

## Directive Usage

```vue
<script setup lang="ts">
import { vElementSize } from '@vueuse/components'

function onResize({ width, height }: { width: number, height: number }) {
  console.log(width, height)
}
</script>

<template>
  <textarea v-element-size="onResize" />
  <!-- with options -->
  <textarea v-element-size="[onResize, { width: 100, height: 100 }, { box: 'content-box' }]" />
</template>
```

## Type Declarations

```ts
export interface ElementSize {
  width: number
  height: number
}
export interface UseElementSizeOptions extends UseResizeObserverOptions {}
export interface UseElementSizeReturn {
  width: ShallowRef<number>
  height: ShallowRef<number>
  stop: () => void
}
/**
 * Reactive size of an HTML element.
 *
 * @see https://vueuse.org/useElementSize
 */
export declare function useElementSize(
  target: MaybeComputedElementRef,
  initialSize?: ElementSize,
  options?: UseElementSizeOptions,
): UseElementSizeReturn
```
