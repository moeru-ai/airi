---
category: Elements
---

# useResizeObserver

Reports changes to the dimensions of an Element's content or the border-box

## Usage

```vue
<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { ref, useTemplateRef } from 'vue'

const el = useTemplateRef('el')
const text = ref('')

useResizeObserver(el, (entries) => {
  const entry = entries[0]
  const { width, height } = entry.contentRect
  text.value = `width: ${width}, height: ${height}`
})
</script>

<template>
  <div ref="el">
    {{ text }}
  </div>
</template>
```

## Directive Usage

```vue
<script setup lang="ts">
import { vResizeObserver } from '@vueuse/components'

const text = ref('')

function onResizeObserver(entries) {
  const [entry] = entries
  const { width, height } = entry.contentRect
  text.value = `width: ${width}, height: ${height}`
}
</script>

<template>
  <div v-resize-observer="onResizeObserver">
    {{ text }}
  </div>
</template>
```

[ResizeObserver MDN](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)

## Type Declarations

```ts
/**
 * @deprecated This interface is now available in the DOM lib.
 * Use the global {@link globalThis.ResizeObserverSize} instead.
 */
export interface ResizeObserverSize {
  readonly inlineSize: number
  readonly blockSize: number
}
/**
 * @deprecated This interface is now available in the DOM lib.
 * Use the global {@link globalThis.ResizeObserverEntry} instead.
 */
export interface ResizeObserverEntry {
  readonly target: Element
  readonly contentRect: DOMRectReadOnly
  readonly borderBoxSize: ReadonlyArray<ResizeObserverSize>
  readonly contentBoxSize: ReadonlyArray<ResizeObserverSize>
  readonly devicePixelContentBoxSize: ReadonlyArray<ResizeObserverSize>
}
/**
 * @deprecated This interface is now available in the DOM lib.
 * Use the global {@link globalThis.ResizeObserverCallback} instead.
 */
export type ResizeObserverCallback = (
  entries: ReadonlyArray<ResizeObserverEntry>,
  observer: ResizeObserver,
) => void
export interface UseResizeObserverOptions
  extends ResizeObserverOptions, ConfigurableWindow {}
export interface UseResizeObserverReturn extends Supportable {
  stop: () => void
}
/**
 * Reports changes to the dimensions of an Element's content or the border-box
 *
 * @see https://vueuse.org/useResizeObserver
 * @param target
 * @param callback
 * @param options
 */
export declare function useResizeObserver(
  target:
    | MaybeComputedElementRef
    | MaybeComputedElementRef[]
    | MaybeRefOrGetter<MaybeElement[]>,
  callback: globalThis.ResizeObserverCallback,
  options?: UseResizeObserverOptions,
): UseResizeObserverReturn
```
