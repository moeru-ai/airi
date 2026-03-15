---
category: Elements
---

# useParentElement

Get parent element of the given element

## Usage

When no argument is passed, it will return the parent element of the current component.

```vue
<script setup lang="ts">
import { useParentElement } from '@vueuse/core'

const parentEl = useParentElement()

onMounted(() => {
  console.log(parentEl.value)
})
</script>
```

It can also accept a `ref` as the first argument.

```vue
<script setup lang="ts">
import { useParentElement } from '@vueuse/core'
import { useTemplateRef } from 'vue'

const tooltip = useTemplateRef('tooltip')

const tooltipWrapper = useParentElement(tooltip)

onMounted(() => {
  console.log(tooltipWrapper.value)
})
</script>

<template>
  <div>
    <p ref="tooltip" />
  </div>
</template>
```

## Type Declarations

```ts
export declare function useParentElement(
  element?: MaybeRefOrGetter<HTMLElement | SVGElement | null | undefined>,
): Readonly<ShallowRef<HTMLElement | SVGElement | null | undefined>>
```
