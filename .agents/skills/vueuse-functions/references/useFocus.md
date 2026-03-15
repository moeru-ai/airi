---
category: Sensors
---

# useFocus

Reactive utility to track or set the focus state of a DOM element. State changes to reflect whether the target element is the focused element. Setting reactive value from the outside will trigger `focus` and `blur` events for `true` and `false` values respectively.

## Basic Usage

```ts
import { useFocus } from '@vueuse/core'

const target = shallowRef()
const { focused } = useFocus(target)

watch(focused, (focused) => {
  if (focused)
    console.log('input element has been focused')
  else console.log('input element has lost focus')
})
```

## Setting initial focus

To focus the element on its first render one can provide the `initialValue` option as `true`. This will trigger a `focus` event on the target element.

```ts
import { useFocus } from '@vueuse/core'

const target = shallowRef()
const { focused } = useFocus(target, { initialValue: true })
```

## Change focus state

Changes of the `focused` reactive ref will automatically trigger `focus` and `blur` events for `true` and `false` values respectively. You can utilize this behavior to focus the target element as a result of another action (e.g. when a button click as shown below).

```vue
<script setup lang="ts">
import { useFocus } from '@vueuse/core'
import { shallowRef } from 'vue'

const input = shallowRef()
const { focused } = useFocus(input)
</script>

<template>
  <div>
    <button type="button" @click="focused = true">
      Click me to focus input below
    </button>
    <input ref="input" type="text">
  </div>
</template>
```

## Type Declarations

```ts
export interface UseFocusOptions extends ConfigurableWindow {
  /**
   * Initial value. If set true, then focus will be set on the target
   *
   * @default false
   */
  initialValue?: boolean
  /**
   * Replicate the :focus-visible behavior of CSS
   *
   * @default false
   */
  focusVisible?: boolean
  /**
   * Prevent scrolling to the element when it is focused.
   *
   * @default false
   */
  preventScroll?: boolean
}
export interface UseFocusReturn {
  /**
   * If read as true, then the element has focus. If read as false, then the element does not have focus
   * If set to true, then the element will be focused. If set to false, the element will be blurred.
   */
  focused: WritableComputedRef<boolean>
}
/**
 * Track or set the focus state of a DOM element.
 *
 * @see https://vueuse.org/useFocus
 * @param target The target element for the focus and blur events.
 * @param options
 */
export declare function useFocus(
  target: MaybeElementRef,
  options?: UseFocusOptions,
): UseFocusReturn
```
