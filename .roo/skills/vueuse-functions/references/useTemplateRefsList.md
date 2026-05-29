---
category: Component
---

# useTemplateRefsList

Shorthand for binding refs to template elements and components inside `v-for`.

## Usage

```vue
<script setup lang="ts">
import { useTemplateRefsList } from '@vueuse/core'
import { onUpdated } from 'vue'

const refs = useTemplateRefsList<HTMLDivElement>()

onUpdated(() => {
  console.log(refs)
})
</script>

<template>
  <div v-for="i of 5" :key="i" :ref="refs.set" />
</template>
```

## Type Declarations

```ts
export type TemplateRefsList<T> = T[] & {
  set: (el: object | null) => void
}
export declare function useTemplateRefsList<T = Element>(): Readonly<
  Ref<Readonly<TemplateRefsList<T>>>
>
```
