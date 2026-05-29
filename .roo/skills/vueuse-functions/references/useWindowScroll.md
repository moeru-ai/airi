---
category: Elements
---

# useWindowScroll

Reactive window scroll

## Usage

```vue
<script setup lang="ts">
import { useWindowScroll } from '@vueuse/core'

const { x, y } = useWindowScroll()
</script>

<template>
  <div>
    read current x, y scroll: {{ x }}, {{ y }}
  </div>
  <button @click="x = 100">
    scroll X to 100
  </button>
  <button @click="y = 100">
    scroll Y to 100
  </button>
</template>
```

## Type Declarations

```ts
export interface UseWindowScrollOptions
  extends ConfigurableWindow, UseScrollOptions {}
export interface UseWindowScrollReturn extends UseScrollReturn {}
/**
 * Reactive window scroll.
 *
 * @see https://vueuse.org/useWindowScroll
 * @param options
 */
export declare function useWindowScroll(
  options?: UseWindowScrollOptions,
): UseWindowScrollReturn
```
