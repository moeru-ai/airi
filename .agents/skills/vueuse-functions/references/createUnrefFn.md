---
category: Utilities
related: reactify
---

# createUnrefFn

Make a plain function accepting ref and raw values as arguments.
Returns the same value the unconverted function returns, with proper typing.

::: tip
Make sure you're using the right tool for the job. Using `reactify`
might be more pertinent in some cases where you want to evaluate the function on each changes of it's arguments.
:::

## Usage

```ts
import { createUnrefFn } from '@vueuse/core'
import { shallowRef } from 'vue'

const url = shallowRef('https://httpbin.org/post')
const data = shallowRef({ foo: 'bar' })

function post(url, data) {
  return fetch(url, { data })
}
const unrefPost = createUnrefFn(post)

post(url, data) /* ❌ Will throw an error because the arguments are refs */
unrefPost(url, data) /* ✔️ Will Work because the arguments will be auto unref */
```

## Type Declarations

```ts
export type UnrefFn<T> = T extends (...args: infer A) => infer R
  ? (
      ...args: {
        [K in keyof A]: MaybeRef<A[K]>
      }
    ) => R
  : never
/**
 * Make a plain function accepting ref and raw values as arguments.
 * Returns the same value the unconverted function returns, with proper typing.
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function createUnrefFn<T extends Function>(fn: T): UnrefFn<T>
```
