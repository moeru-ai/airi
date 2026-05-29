---
category: Array
---

# useArrayMap

Reactive `Array.map`

## Usage

### Use with array of multiple refs

```ts
import { useArrayMap } from '@vueuse/core'

const item1 = ref(0)
const item2 = ref(2)
const item3 = ref(4)
const item4 = ref(6)
const item5 = ref(8)
const list = [item1, item2, item3, item4, item5]
const result = useArrayMap(list, i => i * 2)
// result.value: [0, 4, 8, 12, 16]
item1.value = 1
// result.value: [2, 4, 8, 12, 16]
```

### Use with reactive array

```ts
import { useArrayMap } from '@vueuse/core'

const list = ref([0, 1, 2, 3, 4])
const result = useArrayMap(list, i => i * 2)
// result.value: [0, 2, 4, 6, 8]
list.value.pop()
// result.value: [0, 2, 4, 6]
```

## Type Declarations

```ts
export type UseArrayMapReturn<T = any> = ComputedRef<T[]>
/**
 * Reactive `Array.map`
 *
 * @see https://vueuse.org/useArrayMap
 * @param list - the array was called upon.
 * @param fn - a function that is called for every element of the given `list`. Each time `fn` executes, the returned value is added to the new array.
 *
 * @returns a new array with each element being the result of the callback function.
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useArrayMap<T, U = T>(
  list: MaybeRefOrGetter<MaybeRefOrGetter<T>[]>,
  fn: (element: T, index: number, array: T[]) => U,
): UseArrayMapReturn<U>
```
