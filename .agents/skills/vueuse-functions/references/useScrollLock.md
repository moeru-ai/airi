---
category: Sensors
---

# useScrollLock

Lock scrolling of the element.

## Usage

```vue
<script setup lang="ts">
import { useScrollLock } from '@vueuse/core'
import { useTemplateRef } from 'vue'

const el = useTemplateRef('el')
const isLocked = useScrollLock(el)

isLocked.value = true // lock
isLocked.value = false // unlock
</script>

<template>
  <div ref="el" />
</template>
```

## Directive Usage

```vue
<script setup lang="ts">
import { vScrollLock } from '@vueuse/components'

const data = ref([1, 2, 3, 4, 5, 6])
const isLocked = ref(false)
const toggleLock = useToggle(isLocked)
</script>

<template>
  <div v-scroll-lock="isLocked">
    <div v-for="item in data" :key="item">
      {{ item }}
    </div>
  </div>
  <button @click="toggleLock()">
    Toggle lock state
  </button>
</template>
```

## Type Declarations

```ts
/**
 * Lock scrolling of the element.
 *
 * @see https://vueuse.org/useScrollLock
 * @param element
 */
export declare function useScrollLock(
  element: MaybeRefOrGetter<
    HTMLElement | SVGElement | Window | Document | null | undefined
  >,
  initialState?: boolean,
): WritableComputedRef<boolean, boolean>
```
