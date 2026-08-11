---
category: Elements
---

# useActiveElement

Reactive `document.activeElement`. Returns a shallow ref that updates when focus changes.

## Usage

```vue
<script setup lang="ts">
import { useActiveElement } from '@vueuse/core'
import { watch } from 'vue'

const activeElement = useActiveElement()

watch(activeElement, (el) => {
  console.log('focus changed to', el)
})
</script>
```

### Shadow DOM Support

By default, `useActiveElement` will traverse into shadow DOM to find the deeply active element. Set `deep: false` to disable this behavior.

```ts
import { useActiveElement } from '@vueuse/core'

// Only get the shadow host, not the element inside shadow DOM
const activeElement = useActiveElement({ deep: false })
```

### Track Element Removal

Set `triggerOnRemoval: true` to update the active element when the currently active element is removed from the DOM. This uses a `MutationObserver` under the hood.

```ts
import { useActiveElement } from '@vueuse/core'

const activeElement = useActiveElement({ triggerOnRemoval: true })
```

## Component Usage

```vue
<template>
  <UseActiveElement v-slot="{ element }">
    Active element is {{ element?.dataset.id }}
  </UseActiveElement>
</template>
```

## Type Declarations

```ts
export interface UseActiveElementOptions
  extends ConfigurableWindow, ConfigurableDocumentOrShadowRoot {
  /**
   * Search active element deeply inside shadow dom
   *
   * @default true
   */
  deep?: boolean
  /**
   * Track active element when it's removed from the DOM
   * Using a MutationObserver under the hood
   * @default false
   */
  triggerOnRemoval?: boolean
}
export type UseActiveElementReturn<T extends HTMLElement = HTMLElement> =
  ShallowRef<T | null | undefined>
/**
 * Reactive `document.activeElement`
 *
 * @see https://vueuse.org/useActiveElement
 * @param options
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useActiveElement<T extends HTMLElement>(
  options?: UseActiveElementOptions,
): UseActiveElementReturn<T>
```
