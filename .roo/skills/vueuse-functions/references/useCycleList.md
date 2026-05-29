---
category: Utilities
---

# useCycleList

Cycle through a list of items.

<CourseLink href="https://vueschool.io/lessons/create-an-image-carousel-with-vueuse?friend=vueuse">Learn how to use useCycleList to create an image carousel with this FREE video lesson from Vue School!</CourseLink>

## Usage

```ts
import { useCycleList } from '@vueuse/core'

const { state, next, prev, go } = useCycleList([
  'Dog',
  'Cat',
  'Lizard',
  'Shark',
  'Whale',
  'Dolphin',
  'Octopus',
  'Seal',
])

console.log(state.value) // 'Dog'

prev()

console.log(state.value) // 'Seal'

go(3)

console.log(state.value) // 'Shark'
```

## Type Declarations

```ts
export interface UseCycleListOptions<T> {
  /**
   * The initial value of the state.
   * A ref can be provided to reuse.
   */
  initialValue?: MaybeRef<T>
  /**
   * The default index when
   */
  fallbackIndex?: number
  /**
   * Custom function to get the index of the current value.
   */
  getIndexOf?: (value: T, list: T[]) => number
}
/**
 * Cycle through a list of items
 *
 * @see https://vueuse.org/useCycleList
 */
export declare function useCycleList<T>(
  list: MaybeRefOrGetter<T[]>,
  options?: UseCycleListOptions<T>,
): UseCycleListReturn<T>
export interface UseCycleListReturn<T> {
  state: ShallowRef<T>
  index: WritableComputedRef<number>
  next: (n?: number) => T
  prev: (n?: number) => T
  /**
   * Go to a specific index
   */
  go: (i: number) => T
}
```
