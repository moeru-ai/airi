---
category: Animation
---

# useIntervalFn

Wrapper for `setInterval` with controls

## Usage

```ts
import { useIntervalFn } from '@vueuse/core'

const { pause, resume, isActive } = useIntervalFn(() => {
  /* your function */
}, 1000)
```

## Type Declarations

```ts
export interface UseIntervalFnOptions {
  /**
   * Start the timer immediately
   *
   * @default true
   */
  immediate?: boolean
  /**
   * Execute the callback immediately after calling `resume`
   *
   * @default false
   */
  immediateCallback?: boolean
}
export type UseIntervalFnReturn = Pausable
/**
 * Wrapper for `setInterval` with controls
 *
 * @see https://vueuse.org/useIntervalFn
 * @param cb
 * @param interval
 * @param options
 */
export declare function useIntervalFn(
  cb: Fn,
  interval?: MaybeRefOrGetter<number>,
  options?: UseIntervalFnOptions,
): UseIntervalFnReturn
```
