---
category: Array
---

# useArrayEvery

Reactive `Array.every`

## Usage

### Use with array of multiple refs

```ts
import { useArrayEvery } from '@vueuse/core'

const item1 = ref(0)
const item2 = ref(2)
const item3 = ref(4)
const item4 = ref(6)
const item5 = ref(8)
const list = [item1, item2, item3, item4, item5]
const result = useArrayEvery(list, i => i % 2 === 0)
// result.value: true
item1.value = 1
// result.value: false
```

### Use with reactive array

```ts
import { useArrayEvery } from '@vueuse/core'

const list = ref([0, 2, 4, 6, 8])
const result = useArrayEvery(list, i => i % 2 === 0)
// result.value: true
list.value.push(9)
// result.value: false
```

## Type Declarations

```ts
export type UseArrayEveryReturn = ComputedRef<boolean>
/**
 * Reactive `Array.every`
 *
 * @see https://vueuse.org/useArrayEvery
 * @param list - the array was called upon.
 * @param fn - a function to test each element.
 *
 * @returns **true** if the `fn` function returns a **truthy** value for every element from the array. Otherwise, **false**.
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useArrayEvery<T>(
  list: MaybeRefOrGetter<MaybeRefOrGetter<T>[]>,
  fn: (element: T, index: number, array: MaybeRefOrGetter<T>[]) => unknown,
): UseArrayEveryReturn
```
