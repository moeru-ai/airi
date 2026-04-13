---
category: Sensors
---

# useTextSelection

Reactively track user text selection based on [`Window.getSelection`](https://developer.mozilla.org/en-US/docs/Web/API/Window/getSelection).

## Usage

```vue
<script setup lang="ts">
import { useTextSelection } from '@vueuse/core'

const state = useTextSelection()
</script>

<template>
  <p>{{ state.text }}</p>
</template>
```

## Type Declarations

```ts
export interface UseTextSelectionOptions extends ConfigurableWindow {}
export interface UseTextSelectionReturn {
  text: ComputedRef<string>
  rects: ComputedRef<DOMRect[]>
  ranges: ComputedRef<Range[]>
  selection: ShallowRef<Selection | null>
}
/**
 * Reactively track user text selection based on [`Window.getSelection`](https://developer.mozilla.org/en-US/docs/Web/API/Window/getSelection).
 *
 * @see https://vueuse.org/useTextSelection
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useTextSelection(
  options?: UseTextSelectionOptions,
): UseTextSelectionReturn
```
