---
category: Array
---

# useArrayIncludes

Reactive `Array.includes`

## Usage

### Use with reactive array

```ts
import { useArrayIncludes } from '@vueuse/core'

const list = ref([0, 2, 4, 6, 8])
const result = useArrayIncludes(list, 10)
// result.value: false
list.value.push(10)
// result.value: true
list.value.pop()
// result.value: false
```

## Type Declarations

```ts
export type UseArrayIncludesComparatorFn<T, V> = (
  element: T,
  value: V,
  index: number,
  array: MaybeRefOrGetter<T>[],
) => boolean
export interface UseArrayIncludesOptions<T, V> {
  fromIndex?: number
  comparator?: UseArrayIncludesComparatorFn<T, V> | keyof T
}
export type UseArrayIncludesReturn = ComputedRef<boolean>
/**
 * Reactive `Array.includes`
 *
 * @see https://vueuse.org/useArrayIncludes
 *
 * @returns true if the `value` is found in the array. Otherwise, false.
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useArrayIncludes<T, V = any>(
  list: MaybeRefOrGetter<MaybeRefOrGetter<T>[]>,
  value: MaybeRefOrGetter<V>,
  comparator?: UseArrayIncludesComparatorFn<T, V>,
): UseArrayIncludesReturn
export declare function useArrayIncludes<T, V = any>(
  list: MaybeRefOrGetter<MaybeRefOrGetter<T>[]>,
  value: MaybeRefOrGetter<V>,
  comparator?: keyof T,
): UseArrayIncludesReturn
export declare function useArrayIncludes<T, V = any>(
  list: MaybeRefOrGetter<MaybeRefOrGetter<T>[]>,
  value: MaybeRefOrGetter<V>,
  options?: UseArrayIncludesOptions<T, V>,
): UseArrayIncludesReturn
```
