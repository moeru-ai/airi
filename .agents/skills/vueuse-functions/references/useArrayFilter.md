---
category: Array
---

# useArrayFilter

Reactive `Array.filter`

## Usage

### Use with array of multiple refs

```ts
import { useArrayFilter } from '@vueuse/core'

const item1 = ref(0)
const item2 = ref(2)
const item3 = ref(4)
const item4 = ref(6)
const item5 = ref(8)
const list = [item1, item2, item3, item4, item5]
const result = useArrayFilter(list, i => i % 2 === 0)
// result.value: [0, 2, 4, 6, 8]
item2.value = 1
// result.value: [0, 4, 6, 8]
```

### Use with reactive array

```ts
import { useArrayFilter } from '@vueuse/core'

const list = ref([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
const result = useArrayFilter(list, i => i % 2 === 0)
// result.value: [0, 2, 4, 6, 8]
list.value.shift()
// result.value: [2, 4, 6, 8]
```

## Type Declarations

```ts
export type UseArrayFilterReturn<T = any> = ComputedRef<T[]>
/**
 * Reactive `Array.filter`
 *
 * @see https://vueuse.org/useArrayFilter
 * @param list - the array was called upon.
 * @param fn - a function that is called for every element of the given `list`. Each time `fn` executes, the returned value is added to the new array.
 *
 * @returns a shallow copy of a portion of the given array, filtered down to just the elements from the given array that pass the test implemented by the provided function. If no elements pass the test, an empty array will be returned.
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useArrayFilter<T, S extends T>(
  list: MaybeRefOrGetter<MaybeRefOrGetter<T>[]>,
  fn: (element: T, index: number, array: T[]) => element is S,
): UseArrayFilterReturn<S>
export declare function useArrayFilter<T>(
  list: MaybeRefOrGetter<MaybeRefOrGetter<T>[]>,
  fn: (element: T, index: number, array: T[]) => unknown,
): UseArrayFilterReturn<T>
```
