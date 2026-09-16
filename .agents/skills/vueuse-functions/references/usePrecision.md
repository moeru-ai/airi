---
category: '@Math'
---

# usePrecision

Reactively set the precision of a number.

## Usage

```ts
import { usePrecision } from '@vueuse/math'

const value = ref(3.1415)
const result = usePrecision(value, 2) // 3.14

const ceilResult = usePrecision(value, 2, {
  math: 'ceil'
}) // 3.15

const floorResult = usePrecision(value, 3, {
  math: 'floor'
}) // 3.141
```

## Type Declarations

```ts
export interface UsePrecisionOptions {
  /**
   * Method to use for rounding
   *
   * @default 'round'
   */
  math?: "floor" | "ceil" | "round"
}
/**
 * Reactively set the precision of a number.
 *
 * @see https://vueuse.org/usePrecision
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function usePrecision(
  value: MaybeRefOrGetter<number>,
  digits: MaybeRefOrGetter<number>,
  options?: MaybeRefOrGetter<UsePrecisionOptions>,
): ComputedRef<number>
```
