---
category: Utilities
---

# useToNumber

Reactively convert a string ref to number.

## Usage

```ts
import { useToNumber } from '@vueuse/core'
import { shallowRef } from 'vue'

const str = shallowRef('123')
const number = useToNumber(str)

number.value // 123
```

## Type Declarations

```ts
export interface UseToNumberOptions {
  /**
   * Method to use to convert the value to a number.
   *
   * Or a custom function for the conversion.
   *
   * @default 'parseFloat'
   */
  method?: "parseFloat" | "parseInt" | ((value: string | number) => number)
  /**
   * The base in mathematical numeral systems passed to `parseInt`.
   * Only works with `method: 'parseInt'`
   */
  radix?: number
  /**
   * Replace NaN with zero
   *
   * @default false
   */
  nanToZero?: boolean
}
/**
 * Reactively convert a string ref to number.
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useToNumber(
  value: MaybeRefOrGetter<number | string>,
  options?: UseToNumberOptions,
): ComputedRef<number>
```
