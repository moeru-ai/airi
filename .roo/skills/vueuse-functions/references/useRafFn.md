---
category: Animation
---

# useRafFn

Call function on every `requestAnimationFrame`. With controls of pausing and resuming.

## Usage

```ts
import { useRafFn } from '@vueuse/core'
import { shallowRef } from 'vue'

const count = shallowRef(0)

const { pause, resume } = useRafFn(() => {
  count.value++
  console.log(count.value)
})
```

## Type Declarations

```ts
export interface UseRafFnCallbackArguments {
  /**
   * Time elapsed between this and the last frame.
   */
  delta: number
  /**
   * Time elapsed since the creation of the web page. See {@link https://developer.mozilla.org/en-US/docs/Web/API/DOMHighResTimeStamp#the_time_origin Time origin}.
   */
  timestamp: DOMHighResTimeStamp
}
export interface UseRafFnOptions extends ConfigurableWindow {
  /**
   * Start the requestAnimationFrame loop immediately on creation
   *
   * @default true
   */
  immediate?: boolean
  /**
   * The maximum frame per second to execute the function.
   * Set to `null` to disable the limit.
   *
   * @default null
   */
  fpsLimit?: MaybeRefOrGetter<number | null>
  /**
   * After the requestAnimationFrame loop executed once, it will be automatically stopped.
   *
   * @default false
   */
  once?: boolean
}
/**
 * Call function on every `requestAnimationFrame`. With controls of pausing and resuming.
 *
 * @see https://vueuse.org/useRafFn
 * @param fn
 * @param options
 */
export declare function useRafFn(
  fn: (args: UseRafFnCallbackArguments) => void,
  options?: UseRafFnOptions,
): Pausable
```
