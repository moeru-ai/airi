---
category: Array
---

# useSorted

reactive sort array

## Usage

```ts
import { useSorted } from '@vueuse/core'

// general sort
const source = [10, 3, 5, 7, 2, 1, 8, 6, 9, 4]
const sorted = useSorted(source)
console.log(sorted.value) // [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
console.log(source) // [10, 3, 5, 7, 2, 1, 8, 6, 9, 4]

// object sort
const objArr = [{
  name: 'John',
  age: 40,
}, {
  name: 'Jane',
  age: 20,
}, {
  name: 'Joe',
  age: 30,
}, {
  name: 'Jenny',
  age: 22,
}]
const objSorted = useSorted(objArr, (a, b) => a.age - b.age)
```

### dirty mode

dirty mode will change the source array.

```ts
const source = ref([10, 3, 5, 7, 2, 1, 8, 6, 9, 4])
const sorted = useSorted(source, (a, b) => a - b, {
  dirty: true,
})
console.log(source)// output: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
```

## Type Declarations

```ts
export type UseSortedCompareFn<T = any> = (a: T, b: T) => number
export type UseSortedFn<T = any> = (
  arr: T[],
  compareFn: UseSortedCompareFn<T>,
) => T[]
export interface UseSortedOptions<T = any> {
  /**
   * sort algorithm
   */
  sortFn?: UseSortedFn<T>
  /**
   * compare function
   */
  compareFn?: UseSortedCompareFn<T>
  /**
   * change the value of the source array
   * @default false
   */
  dirty?: boolean
}
/**
 * reactive sort array
 *
 * @see https://vueuse.org/useSorted
 */
export declare function useSorted<T = any>(
  source: MaybeRefOrGetter<T[]>,
  compareFn?: UseSortedCompareFn<T>,
): Ref<T[]>
export declare function useSorted<T = any>(
  source: MaybeRefOrGetter<T[]>,
  options?: UseSortedOptions<T>,
): Ref<T[]>
export declare function useSorted<T = any>(
  source: MaybeRefOrGetter<T[]>,
  compareFn?: UseSortedCompareFn<T>,
  options?: Omit<UseSortedOptions<T>, "compareFn">,
): Ref<T[]>
```
