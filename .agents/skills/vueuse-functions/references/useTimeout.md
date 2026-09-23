---
category: Animation
---

# useTimeout

Reactive value that becomes `true` after a given time.

## Usage

```ts
import { useTimeout } from '@vueuse/core'

const ready = useTimeout(1000)
```

After 1 second, `ready.value` becomes `true`.

### With Controls

```ts
import { useTimeout } from '@vueuse/core'

const { ready, start, stop, isPending } = useTimeout(1000, { controls: true })

// Check if timeout is pending
console.log(isPending.value) // true

// Stop the timeout
stop()

// Start/restart the timeout
start()
```

### Options

| Option      | Type         | Default | Description                                      |
| ----------- | ------------ | ------- | ------------------------------------------------ |
| `controls`  | `boolean`    | `false` | Expose `start`, `stop`, and `isPending` controls |
| `immediate` | `boolean`    | `true`  | Start the timeout immediately                    |
| `callback`  | `() => void` | —       | Called when the timeout completes                |

### Callback on Timeout

```ts
import { useTimeout } from '@vueuse/core'

useTimeout(1000, {
  callback: () => {
    console.log('Timeout completed!')
  },
})
```

### Reactive Interval

The timeout duration can be reactive:

```ts
import { useTimeout } from '@vueuse/core'

const duration = ref(1000)
const ready = useTimeout(duration)

// Change the duration (only affects future timeouts when using controls)
duration.value = 2000
```

## Type Declarations

```ts
export interface UseTimeoutOptions<
  Controls extends boolean,
> extends UseTimeoutFnOptions {
  /**
   * Expose more controls
   *
   * @default false
   */
  controls?: Controls
  /**
   * Callback on timeout
   */
  callback?: Fn
}
export type UseTimeoutReturn =
  | ComputedRef<boolean>
  | ({
      readonly ready: ComputedRef<boolean>
    } & Stoppable)
/**
 * @deprecated use UseTimeoutReturn instead
 */
export type UseTimoutReturn = UseTimeoutReturn
/**
 * Update value after a given time with controls.
 *
 * @see   {@link https://vueuse.org/useTimeout}
 * @param interval
 * @param options
 */
export declare function useTimeout(
  interval?: MaybeRefOrGetter<number>,
  options?: UseTimeoutOptions<false>,
): ComputedRef<boolean>
export declare function useTimeout(
  interval: MaybeRefOrGetter<number>,
  options: UseTimeoutOptions<true>,
): {
  ready: ComputedRef<boolean>
} & Stoppable
```
