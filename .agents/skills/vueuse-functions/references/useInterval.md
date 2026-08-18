---
category: Animation
---

# useInterval

Reactive counter that increases on every interval.

## Usage

```ts
import { useInterval } from '@vueuse/core'

// count will increase every 200ms
const counter = useInterval(200)
```

### With Controls

```ts
import { useInterval } from '@vueuse/core'

const { counter, reset, pause, resume, isActive } = useInterval(200, {
  controls: true,
})

// Reset counter to 0
reset()

// Pause/resume the interval
pause()
resume()
```

### Options

| Option      | Type                      | Default | Description                                                |
| ----------- | ------------------------- | ------- | ---------------------------------------------------------- |
| `controls`  | `boolean`                 | `false` | Expose `pause`, `resume`, `reset`, and `isActive` controls |
| `immediate` | `boolean`                 | `true`  | Start the interval immediately                             |
| `callback`  | `(count: number) => void` | —       | Called on every interval with the current count            |

### Reactive Interval

The interval can be reactive:

```ts
import { useInterval } from '@vueuse/core'

const intervalMs = ref(1000)
const counter = useInterval(intervalMs)

// Change the interval dynamically
intervalMs.value = 500
```

### Callback on Every Interval

```ts
import { useInterval } from '@vueuse/core'

useInterval(1000, {
  callback: (count) => {
    console.log(`Tick ${count}`)
  },
})
```

## Type Declarations

```ts
export interface UseIntervalOptions<Controls extends boolean> {
  /**
   * Expose more controls
   *
   * @default false
   */
  controls?: Controls
  /**
   * Execute the update immediately on calling
   *
   * @default true
   */
  immediate?: boolean
  /**
   * Callback on every interval
   */
  callback?: (count: number) => void
}
export interface UseIntervalControls {
  counter: ShallowRef<number>
  reset: () => void
}
export type UseIntervalReturn =
  | Readonly<ShallowRef<number>>
  | Readonly<UseIntervalControls & Pausable>
/**
 * Reactive counter increases on every interval
 *
 * @see https://vueuse.org/useInterval
 * @param interval
 * @param options
 */
export declare function useInterval(
  interval?: MaybeRefOrGetter<number>,
  options?: UseIntervalOptions<false>,
): Readonly<ShallowRef<number>>
export declare function useInterval(
  interval: MaybeRefOrGetter<number>,
  options: UseIntervalOptions<true>,
): Readonly<UseIntervalControls & Pausable>
```
