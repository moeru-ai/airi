---
category: '@Math'
alias: not
---

# logicNot

`NOT` condition for ref.

## Usage

```ts
import { whenever } from '@vueuse/core'
import { logicNot } from '@vueuse/math'

const a = ref(true)

whenever(logicNot(a), () => {
  console.log('a is now falsy!')
})
```

## Type Declarations

```ts
/**
 * `NOT` conditions for refs.
 *
 * @see https://vueuse.org/logicNot
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function logicNot(v: MaybeRefOrGetter<any>): ComputedRef<boolean>
/** @deprecated use `logicNot` instead */
export declare const not: typeof logicNot
```
