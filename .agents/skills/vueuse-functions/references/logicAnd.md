---
category: '@Math'
alias: and
related: logicNot, logicOr
---

# logicAnd

`AND` condition for refs.

## Usage

```ts
import { whenever } from '@vueuse/core'
import { logicAnd } from '@vueuse/math'

const a = ref(true)
const b = ref(false)

whenever(logicAnd(a, b), () => {
  console.log('both a and b are now truthy!')
})
```

## Type Declarations

```ts
/**
 * `AND` conditions for refs.
 *
 * @see https://vueuse.org/logicAnd
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function logicAnd(
  ...args: MaybeRefOrGetter<any>[]
): ComputedRef<boolean>
/** @deprecated use `logicAnd` instead */
export declare const and: typeof logicAnd
```
