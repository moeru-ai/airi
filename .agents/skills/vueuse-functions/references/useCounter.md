---
category: Utilities
---

# useCounter

Basic counter with utility functions.

## Basic Usage

```ts
import { useCounter } from '@vueuse/core'

const { count, inc, dec, set, reset } = useCounter()
```

## Usage with options

```ts
import { useCounter } from '@vueuse/core'

const { count, inc, dec, set, reset } = useCounter(1, { min: 0, max: 16 })
```

## Type Declarations

```ts
export interface UseCounterOptions {
  min?: number
  max?: number
}
export interface UseCounterReturn {
  /**
   * The current value of the counter.
   */
  readonly count: Readonly<Ref<number>>
  /**
   * Increment the counter.
   *
   * @param {number} [delta=1] The number to increment.
   */
  inc: (delta?: number) => void
  /**
   * Decrement the counter.
   *
   * @param {number} [delta=1] The number to decrement.
   */
  dec: (delta?: number) => void
  /**
   * Get the current value of the counter.
   */
  get: () => number
  /**
   * Set the counter to a new value.
   *
   * @param val The new value of the counter.
   */
  set: (val: number) => void
  /**
   * Reset the counter to an initial value.
   */
  reset: (val?: number) => number
}
/**
 * Basic counter with utility functions.
 *
 * @see https://vueuse.org/useCounter
 * @param [initialValue]
 * @param options
 */
export declare function useCounter(
  initialValue?: MaybeRef<number>,
  options?: UseCounterOptions,
): {
  count: Readonly<
    | Ref<number, number>
    | ShallowRef<number, number>
    | WritableComputedRef<number, number>
  >
  inc: (delta?: number) => number
  dec: (delta?: number) => number
  get: () => number
  set: (val: number) => number
  reset: (val?: number) => number
}
```
