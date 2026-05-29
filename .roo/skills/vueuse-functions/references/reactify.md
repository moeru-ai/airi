---
category: Reactivity
alias: createReactiveFn
---

# reactify

Converts plain functions into reactive functions. The converted function accepts refs as its arguments and returns a ComputedRef, with proper typing.

::: tip
Interested to see some application or looking for some pre-reactified functions?

Check out [⚗️ Vue Chemistry](https://github.com/antfu/vue-chemistry)!
:::

## Usage

Basic example

```ts
import { reactify } from '@vueuse/core'
import { shallowRef } from 'vue'

// a plain function
function add(a: number, b: number): number {
  return a + b
}

// now it accept refs and returns a computed ref
// (a: number | Ref<number>, b: number | Ref<number>) => ComputedRef<number>
const reactiveAdd = reactify(add)

const a = shallowRef(1)
const b = shallowRef(2)
const sum = reactiveAdd(a, b)

console.log(sum.value) // 3

a.value = 5

console.log(sum.value) // 7
```

An example of implementing a reactive [Pythagorean theorem](https://en.wikipedia.org/wiki/Pythagorean_theorem).

<!-- eslint-skip -->

```ts
import { reactify } from '@vueuse/core'
import { shallowRef } from 'vue'

const pow = reactify(Math.pow)
const sqrt = reactify(Math.sqrt)
const add = reactify((a: number, b: number) => a + b)

const a = shallowRef(3)
const b = shallowRef(4)
const c = sqrt(add(pow(a, 2), pow(b, 2)))
console.log(c.value) // 5

// 5:12:13
a.value = 5
b.value = 12
console.log(c.value) // 13
```

You can also do it this way:

```ts
import { reactify } from '@vueuse/core'
import { shallowRef } from 'vue'

function pythagorean(a: number, b: number) {
  return Math.sqrt(a ** 2 + b ** 2)
}

const a = shallowRef(3)
const b = shallowRef(4)

const c = reactify(pythagorean)(a, b)
console.log(c.value) // 5
```

Another example of making reactive `stringify`

```ts
import { reactify } from '@vueuse/core'
import { shallowRef } from 'vue'

const stringify = reactify(JSON.stringify)

const obj = shallowRef(42)
const dumped = stringify(obj)

console.log(dumped.value) // '42'

obj.value = { foo: 'bar' }

console.log(dumped.value) // '{"foo":"bar"}'
```

## Type Declarations

```ts
export type Reactified<T, Computed extends boolean> = T extends (
  ...args: infer A
) => infer R
  ? (
      ...args: {
        [K in keyof A]: Computed extends true
          ? MaybeRefOrGetter<A[K]>
          : MaybeRef<A[K]>
      }
    ) => ComputedRef<R>
  : never
export type ReactifyReturn<
  T extends AnyFn = AnyFn,
  K extends boolean = true,
> = Reactified<T, K>
export interface ReactifyOptions<T extends boolean> {
  /**
   * Accept passing a function as a reactive getter
   *
   * @default true
   */
  computedGetter?: T
}
/**
 * Converts plain function into a reactive function.
 * The converted function accepts refs as it's arguments
 * and returns a ComputedRef, with proper typing.
 *
 * @param fn - Source function
 * @param options - Options
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function reactify<T extends AnyFn, K extends boolean = true>(
  fn: T,
  options?: ReactifyOptions<K>,
): ReactifyReturn<T, K>
/** @deprecated use `reactify` instead */
export declare const createReactiveFn: typeof reactify
```
