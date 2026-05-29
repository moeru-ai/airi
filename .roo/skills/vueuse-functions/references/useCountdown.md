---
category: Time
---

# useCountdown

Reactive countdown timer in seconds.

## Usage

```ts
import { useCountdown } from '@vueuse/core'

const countdownSeconds = 5
const { remaining, start, stop, pause, resume } = useCountdown(countdownSeconds, {
  onComplete() {

  },
  onTick() {

  }
})
```

You can use a `ref` to change the initial countdown.
`start()` and `resume()` also accept a new countdown value for the next countdown.

```ts
import { useCountdown } from '@vueuse/core'
import { shallowRef } from 'vue'

const countdown = shallowRef(5)
const { start, reset } = useCountdown(countdown, {
})

// change the countdown value
countdown.value = 10

// start a new countdown with 2 seconds
start(2)

// reset the countdown to 4, but do not start it
reset(4)

// start the countdown with the current value of `countdown`
start()
```

## Type Declarations

```ts
export interface UseCountdownOptions extends ConfigurableScheduler {
  /**
   *  Interval for the countdown in milliseconds. Default is 1000ms.
   *
   * @deprecated Please use `scheduler` option instead
   */
  interval?: MaybeRefOrGetter<number>
  /**
   * Callback function called when the countdown reaches 0.
   */
  onComplete?: () => void
  /**
   * Callback function called on each tick of the countdown.
   */
  onTick?: () => void
  /**
   * Start the countdown immediately
   *
   * @deprecated Please use `scheduler` option instead
   * @default false
   */
  immediate?: boolean
}
export interface UseCountdownReturn extends Pausable {
  /**
   * Current countdown value.
   */
  remaining: ShallowRef<number>
  /**
   * Resets the countdown and repeatsLeft to their initial values.
   */
  reset: (countdown?: MaybeRefOrGetter<number>) => void
  /**
   * Stops the countdown and resets its state.
   */
  stop: () => void
  /**
   * Reset the countdown and start it again.
   */
  start: (countdown?: MaybeRefOrGetter<number>) => void
}
/**
 * Reactive countdown timer in seconds.
 *
 * @param initialCountdown
 * @param options
 *
 * @see https://vueuse.org/useCountdown
 */
export declare function useCountdown(
  initialCountdown: MaybeRefOrGetter<number>,
  options?: UseCountdownOptions,
): UseCountdownReturn
```
