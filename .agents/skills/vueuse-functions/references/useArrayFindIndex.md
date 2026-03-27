---
category: Array
---

# useArrayFindIndex

Reactive `Array.findIndex`

## Usage

### Use with array of multiple refs

```ts
import { useArrayFindIndex } from '@vueuse/core'

const item1 = ref(0)
const item2 = ref(2)
const item3 = ref(4)
const item4 = ref(6)
const item5 = ref(8)
const list = [item1, item2, item3, item4, item5]
const result = useArrayFindIndex(list, i => i % 2 === 0)
// result.value: 0
item1.value = 1
// result.value: 1
```

### Use with reactive array

```ts
import { useArrayFindIndex } from '@vueuse/core'

const list = ref([0, 2, 4, 6, 8])
const result = useArrayFindIndex(list, i => i % 2 === 0)
// result.value: 0
list.value.unshift(-1)
// result.value: 1
```

## Type Declarations

```ts
export type UseArrayFindIndexReturn = ComputedRef<number>
/**
 * Reactive `Array.findIndex`
 *
 * @see https://vueuse.org/useArrayFindIndex
 * @param list - the array was called upon.
 * @param fn - a function to test each element.
 *
 * @returns the index of the first element in the array that passes the test. Otherwise, "-1".
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useArrayFindIndex<T>(
  list: MaybeRefOrGetter<MaybeRefOrGetter<T>[]>,
  fn: (element: T, index: number, array: MaybeRefOrGetter<T>[]) => unknown,
): UseArrayFindIndexReturn
```
