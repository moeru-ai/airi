---
category: Reactivity
---

# toRefs

Extended [`toRefs`](https://vuejs.org/api/reactivity-utilities.html#torefs) that also accepts refs of an object.

## Usage

```ts
import { toRefs } from '@vueuse/core'
import { reactive, ref } from 'vue'

const objRef = ref({ a: 'a', b: 0 })
const arrRef = ref(['a', 0])

const { a, b } = toRefs(objRef)
const [a, b] = toRefs(arrRef)

const obj = reactive({ a: 'a', b: 0 })
const arr = reactive(['a', 0])

const { a, b } = toRefs(obj)
const [a, b] = toRefs(arr)
```

## Use-cases

### Destructuring a props object

```vue
<script lang="ts">
import { toRefs, useVModel } from '@vueuse/core'

export default {
  setup(props) {
    const refs = toRefs(useVModel(props, 'data'))

    console.log(refs.a.value) // props.data.a
    refs.a.value = 'a' // emit('update:data', { ...props.data, a: 'a' })

    return { ...refs }
  }
}
</script>

<template>
  <div>
    <input v-model="a" type="text">
    <input v-model="b" type="text">
  </div>
</template>
```

## Type Declarations

```ts
export interface ToRefsOptions {
  /**
   * Replace the original ref with a copy on property update.
   *
   * @default true
   */
  replaceRef?: MaybeRefOrGetter<boolean>
}
/**
 * Extended `toRefs` that also accepts refs of an object.
 *
 * @see https://vueuse.org/toRefs
 * @param objectRef A ref or normal object or array.
 * @param options Options
 */
export declare function toRefs<T extends object>(
  objectRef: MaybeRef<T>,
  options?: ToRefsOptions,
): ToRefs<T>
```
