---
category: Sensors
---

# useFocusWithin

Reactive utility to track if an element or one of its decendants has focus. It is meant to match the behavior of the `:focus-within` CSS pseudo-class. A common use case would be on a form element to see if any of its inputs currently have focus.

## Basic Usage

```vue
<script setup lang="ts">
import { useFocusWithin } from '@vueuse/core'
import { ref, watch } from 'vue'

const target = ref()
const { focused } = useFocusWithin(target)

watch(focused, (focused) => {
  if (focused)
    console.log('Target contains the focused element')
  else
    console.log('Target does NOT contain the focused element')
})
</script>

<template>
  <form ref="target">
    <input type="text" placeholder="First Name">
    <input type="text" placeholder="Last Name">
    <input type="text" placeholder="Email">
    <input type="text" placeholder="Password">
  </form>
</template>
```

## Type Declarations

```ts
export interface UseFocusWithinReturn {
  /**
   * True if the element or any of its descendants are focused
   */
  focused: ComputedRef<boolean>
}
/**
 * Track if focus is contained within the target element
 *
 * @see https://vueuse.org/useFocusWithin
 * @param target The target element to track
 * @param options Focus within options
 */
export declare function useFocusWithin(
  target: MaybeElementRef,
  options?: ConfigurableWindow,
): UseFocusWithinReturn
```
