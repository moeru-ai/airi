---
category: Utilities
related: useThrottleFn
---

# useDebounceFn

Debounce execution of a function.

> Debounce is an overloaded waiter: if you keep asking, your requests will be ignored until you stop and give them some time to think about your latest inquiry.

## Usage

```ts
import { useDebounceFn, useEventListener } from '@vueuse/core'

const debouncedFn = useDebounceFn(() => {
  // do something
}, 1000)

useEventListener(window, 'resize', debouncedFn)
```

You can also pass a 3rd parameter to this, with a maximum wait time, similar to [lodash debounce](https://lodash.com/docs/4.17.15#debounce)

```ts
import { useDebounceFn, useEventListener } from '@vueuse/core'

// If no invokation after 5000ms due to repeated input,
// the function will be called anyway.
const debouncedFn = useDebounceFn(() => {
  // do something
}, 1000, { maxWait: 5000 })

useEventListener(window, 'resize', debouncedFn)
```

Optionally, you can get the return value of the function using promise operations.

```ts
import { useDebounceFn } from '@vueuse/core'

const debouncedRequest = useDebounceFn(() => 'response', 1000)

debouncedRequest().then((value) => {
  console.log(value) // 'response'
})

// or use async/await
async function doRequest() {
  const value = await debouncedRequest()
  console.log(value) // 'response'
}
```

Since unhandled rejection error is quite annoying when developer doesn't need the return value, the promise will **NOT** be rejected if the function is canceled **by default**. You need to specify the option `rejectOnCancel: true` to capture the rejection.

```ts
import { useDebounceFn } from '@vueuse/core'

const debouncedRequest = useDebounceFn(() => 'response', 1000, { rejectOnCancel: true })

debouncedRequest()
  .then((value) => {
    // do something
  })
  .catch(() => {
    // do something when canceled
  })

// calling it again will cancel the previous request and gets rejected
setTimeout(debouncedRequest, 500)
```

## Recommended Reading

- [**Debounce vs Throttle**: Definitive Visual Guide](https://kettanaito.com/blog/debounce-vs-throttle)

## Type Declarations

```ts
export type UseDebounceFnReturn<T extends FunctionArgs> = PromisifyFn<T>
/**
 * Debounce execution of a function.
 *
 * @see https://vueuse.org/useDebounceFn
 * @param  fn          A function to be executed after delay milliseconds debounced.
 * @param  ms          A zero-or-greater delay in milliseconds. For event callbacks, values around 100 or 250 (or even higher) are most useful.
 * @param  options     Options
 *
 * @return A new, debounce, function.
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useDebounceFn<T extends FunctionArgs>(
  fn: T,
  ms?: MaybeRefOrGetter<number>,
  options?: DebounceFilterOptions,
): UseDebounceFnReturn<T>
```
