---
category: Sensors
---

# useScroll

Reactive scroll position and state.

## Usage

```vue
<script setup lang="ts">
import { useScroll } from '@vueuse/core'
import { useTemplateRef } from 'vue'

const el = useTemplateRef('el')
const { x, y, isScrolling, arrivedState, directions } = useScroll(el)
</script>

<template>
  <div ref="el" />
</template>
```

### With offsets

```ts
import { useScroll } from '@vueuse/core'
// ---cut---
const { x, y, isScrolling, arrivedState, directions } = useScroll(el, {
  offset: { top: 30, bottom: 30, right: 30, left: 30 },
})
```

### Setting scroll position

Set the `x` and `y` values to make the element scroll to that position.

```vue
<script setup lang="ts">
import { useScroll } from '@vueuse/core'
import { useTemplateRef } from 'vue'

const el = useTemplateRef('el')
const { x, y } = useScroll(el)
</script>

<template>
  <div ref="el" />
  <button @click="x += 10">
    Scroll right 10px
  </button>
  <button @click="y += 10">
    Scroll down 10px
  </button>
</template>
```

### Smooth scrolling

Set `behavior: smooth` to enable smooth scrolling. The `behavior` option defaults to `auto`, which means no smooth scrolling. See the `behavior` option on [`window.scrollTo()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollTo) for more information.

```ts
import { useScroll } from '@vueuse/core'
import { useTemplateRef } from 'vue'

const el = useTemplateRef('el')
const { x, y } = useScroll(el, { behavior: 'smooth' })

// Or as a `ref`:
const smooth = ref(false)
const behavior = computed(() => smooth.value ? 'smooth' : 'auto')
const { x, y } = useScroll(el, { behavior })
```

### Recalculate scroll state

You can call the `measure()` method to manually update the scroll position and `arrivedState` at any time.

This is useful, for example, after dynamic content changes or when you want to recalculate the scroll state outside of scroll events.

```ts
import { useScroll } from '@vueuse/core'
import { nextTick, onMounted, useTemplateRef, watch } from 'vue'

const el = useTemplateRef('el')
const reactiveValue = shallowRef(false)

const { measure } = useScroll(el)

// In a watcher
watch(reactiveValue, () => {
  measure()
})

// Or inside any function
function updateScrollState() {
  // ...some logic
  nextTick(() => {
    measure()
  })
}
```

> [!NOTE]
> it's recommended to call `measure()` inside `nextTick()`, to ensure the DOM is updated first.
> The scroll state is initialized automatically `onMount`.
> You only need to call `measure()` manually if you want to recalculate the state after some dynamic changes.

## Directive Usage

```vue
<script setup lang="ts">
import type { UseScrollReturn } from '@vueuse/core'
import { vScroll } from '@vueuse/components'

const data = ref([1, 2, 3, 4, 5, 6])

function onScroll(state: UseScrollReturn) {
  console.log(state) // {x, y, isScrolling, arrivedState, directions}
}
</script>

<template>
  <div v-scroll="onScroll">
    <div v-for="item in data" :key="item">
      {{ item }}
    </div>
  </div>

  <!-- with options -->
  <div v-scroll="[onScroll, { throttle: 10 }]">
    <div v-for="item in data" :key="item">
      {{ item }}
    </div>
  </div>
</template>
```

## Type Declarations

```ts
export interface UseScrollOptions extends ConfigurableWindow {
  /**
   * Throttle time for scroll event, it’s disabled by default.
   *
   * @default 0
   */
  throttle?: number
  /**
   * The check time when scrolling ends.
   * This configuration will be setting to (throttle + idle) when the `throttle` is configured.
   *
   * @default 200
   */
  idle?: number
  /**
   * Offset arrived states by x pixels
   *
   */
  offset?: {
    left?: number
    right?: number
    top?: number
    bottom?: number
  }
  /**
   * Use MutationObserver to monitor specific DOM changes,
   * such as attribute modifications, child node additions or removals, or subtree changes.
   * @default { mutation: boolean }
   */
  observe?:
    | boolean
    | {
        mutation?: boolean
      }
  /**
   * Trigger it when scrolling.
   *
   */
  onScroll?: (e: Event) => void
  /**
   * Trigger it when scrolling ends.
   *
   */
  onStop?: (e: Event) => void
  /**
   * Listener options for scroll event.
   *
   * @default {capture: false, passive: true}
   */
  eventListenerOptions?: boolean | AddEventListenerOptions
  /**
   * Optionally specify a scroll behavior of `auto` (default, not smooth scrolling) or
   * `smooth` (for smooth scrolling) which takes effect when changing the `x` or `y` refs.
   *
   * @default 'auto'
   */
  behavior?: MaybeRefOrGetter<ScrollBehavior>
  /**
   * On error callback
   *
   * Default log error to `console.error`
   */
  onError?: (error: unknown) => void
}
export interface UseScrollReturn {
  x: WritableComputedRef<number>
  y: WritableComputedRef<number>
  isScrolling: ShallowRef<boolean>
  arrivedState: {
    left: boolean
    right: boolean
    top: boolean
    bottom: boolean
  }
  directions: {
    left: boolean
    right: boolean
    top: boolean
    bottom: boolean
  }
  measure: () => void
}
/**
 * Reactive scroll.
 *
 * @see https://vueuse.org/useScroll
 * @param element
 * @param options
 */
export declare function useScroll(
  element: MaybeRefOrGetter<
    HTMLElement | SVGElement | Window | Document | null | undefined
  >,
  options?: UseScrollOptions,
): UseScrollReturn
```
