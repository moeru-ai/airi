---
category: Animation
---

# useTimeoutFn

Wrapper for `setTimeout` with controls.

## Usage

```ts
import { useTimeoutFn } from '@vueuse/core'

const { isPending, start, stop } = useTimeoutFn(() => {
  /* ... */
}, 3000)
```

## Type Declarations

```ts
export interface UseTimeoutFnOptions {
  /**
   * Start the timer immediately
   *
   * @default true
   */
  immediate?: boolean
  /**
   * Execute the callback immediately after calling `start`
   *
   * @default false
   */
  immediateCallback?: boolean
}
export type UseTimeoutFnReturn<CallbackFn extends AnyFn> = Stoppable<
  Parameters<CallbackFn> | []
>
/**
 * Wrapper for `setTimeout` with controls.
 *
 * @param cb
 * @param interval
 * @param options
 */
export declare function useTimeoutFn<CallbackFn extends AnyFn>(
  cb: CallbackFn,
  interval: MaybeRefOrGetter<number>,
  options?: UseTimeoutFnOptions,
): UseTimeoutFnReturn<CallbackFn>
```
