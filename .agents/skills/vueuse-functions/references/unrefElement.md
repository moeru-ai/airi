---
category: Component
---

# unrefElement

Retrieves the underlying DOM element from a Vue ref or component instance

## Usage

```vue
<script setup lang="ts">
import { unrefElement } from '@vueuse/core'
import { onMounted, useTemplateRef } from 'vue'

const div = useTemplateRef('div') // will be bound to the <div> element
const hello = useTemplateRef('hello') // will be bound to the HelloWorld Component

onMounted(() => {
  console.log(unrefElement(div)) // the <div> element
  console.log(unrefElement(hello)) // the root element of the HelloWorld Component
})
</script>

<template>
  <div ref="div" />
  <HelloWorld ref="hello" />
</template>
```

## Type Declarations

```ts
export type VueInstance = ComponentPublicInstance
export type MaybeElementRef<T extends MaybeElement = MaybeElement> = MaybeRef<T>
export type MaybeComputedElementRef<T extends MaybeElement = MaybeElement> =
  MaybeRefOrGetter<T>
export type MaybeElement =
  | HTMLElement
  | SVGElement
  | VueInstance
  | undefined
  | null
export type UnRefElementReturn<T extends MaybeElement = MaybeElement> =
  T extends VueInstance ? Exclude<MaybeElement, VueInstance> : T | undefined
/**
 * Get the dom element of a ref of element or Vue component instance
 *
 * @param elRef
 */
export declare function unrefElement<T extends MaybeElement>(
  elRef: MaybeComputedElementRef<T>,
): UnRefElementReturn<T>
```
