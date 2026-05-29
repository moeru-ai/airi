---
category: Array
---

# useArrayFindLast

Reactive `Array.findLast`.

## Usage

```ts
import { useArrayFindLast } from '@vueuse/core'

const list = [ref(1), ref(-1), ref(2)]
const positive = useArrayFindLast(list, val => val > 0)
// positive.value: 2
```

### Use with reactive array

```ts
import { useArrayFindLast } from '@vueuse/core'

const list = reactive([-1, -2])
const positive = useArrayFindLast(list, val => val > 0)
// positive.value: undefined
list.push(10)
// positive.value: 10
list.push(5)
// positive.value: 5
```

## Type Declarations

```ts
export type UseArrayFindLastReturn<T = any> = ComputedRef<T | undefined>
/**
 * Reactive `Array.findLast`
 *
 * @see https://vueuse.org/useArrayFindLast
 * @param list - the array was called upon.
 * @param fn - a function to test each element.
 *
 * @returns the last element in the array that satisfies the provided testing function. Otherwise, undefined is returned.
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useArrayFindLast<T>(
  list: MaybeRefOrGetter<MaybeRefOrGetter<T>[]>,
  fn: (element: T, index: number, array: MaybeRefOrGetter<T>[]) => boolean,
): UseArrayFindLastReturn<T>
```
