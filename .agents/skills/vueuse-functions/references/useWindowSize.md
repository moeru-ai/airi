---
category: Elements
---

# useWindowSize

Reactive window size

## Usage

```vue
<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'

const { width, height } = useWindowSize()
</script>

<template>
  <div>
    Width: {{ width }}
    Height: {{ height }}
  </div>
</template>
```

## Component Usage

```vue
<template>
  <UseWindowSize v-slot="{ width, height }">
    Width: {{ width }}
    Height: {{ height }}
  </UseWindowSize>
</template>
```

## Type Declarations

```ts
export interface UseWindowSizeOptions extends ConfigurableWindow {
  initialWidth?: number
  initialHeight?: number
  /**
   * Listen to window `orientationchange` event
   *
   * @default true
   */
  listenOrientation?: boolean
  /**
   * Whether the scrollbar should be included in the width and height
   * Only effective when `type` is `'inner'`
   *
   * @default true
   */
  includeScrollbar?: boolean
  /**
   * Use `window.innerWidth` or `window.outerWidth` or `window.visualViewport`
   * visualViewport documentation from MDN(https://developer.mozilla.org/zh-CN/docs/Web/API/VisualViewport)
   * @default 'inner'
   */
  type?: "inner" | "outer" | "visual"
}
export interface UseWindowSizeReturn {
  width: ShallowRef<number>
  height: ShallowRef<number>
}
/**
 * Reactive window size.
 *
 * @see https://vueuse.org/useWindowSize
 * @param options
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useWindowSize(
  options?: UseWindowSizeOptions,
): UseWindowSizeReturn
```
