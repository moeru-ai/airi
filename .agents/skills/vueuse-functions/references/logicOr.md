---
category: '@Math'
alias: or
related: logicAnd, logicNot
---

# logicOr

`OR` conditions for refs.

## Usage

```ts
import { whenever } from '@vueuse/core'
import { logicOr } from '@vueuse/math'

const a = ref(true)
const b = ref(false)

whenever(logicOr(a, b), () => {
  console.log('either a or b is truthy!')
})
```

## Type Declarations

```ts
/**
 * `OR` conditions for refs.
 *
 * @see https://vueuse.org/logicOr
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function logicOr(
  ...args: MaybeRefOrGetter<any>[]
): ComputedRef<boolean>
/** @deprecated use `logicOr` instead */
export declare const or: typeof logicOr
```
