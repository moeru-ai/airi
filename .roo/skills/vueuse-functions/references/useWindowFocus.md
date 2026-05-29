---
category: Elements
---

# useWindowFocus

Reactively track window focus with `window.onfocus` and `window.onblur` events.

## Usage

```vue
<script setup lang="ts">
import { useWindowFocus } from '@vueuse/core'

const focused = useWindowFocus()
</script>

<template>
  <div>{{ focused }}</div>
</template>
```

## Component Usage

```vue
<template>
  <UseWindowFocus v-slot="{ focused }">
    Document Focus: {{ focused }}
  </UseWindowFocus>
</template>
```

## Type Declarations

```ts
/**
 * Reactively track window focus with `window.onfocus` and `window.onblur`.
 *
 * @see https://vueuse.org/useWindowFocus
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useWindowFocus(
  options?: ConfigurableWindow,
): ShallowRef<boolean>
```
