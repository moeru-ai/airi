---
category: Watch
---

# watchTriggerable

Watch that can be triggered manually

## Usage

A `watch` wrapper that supports manual triggering of `WatchCallback`, which returns an additional `trigger` to execute a `WatchCallback` immediately.

```ts
import { watchTriggerable } from '@vueuse/core'
import { nextTick, shallowRef } from 'vue'

const source = shallowRef(0)

const { trigger, ignoreUpdates } = watchTriggerable(
  source,
  v => console.log(`Changed to ${v}!`),
)

source.value = 'bar'
await nextTick() // logs: Changed to bar!

// Execution of WatchCallback via `trigger` does not require waiting
trigger() // logs: Changed to bar!
```

### `onCleanup`

When you want to manually call a `watch` that uses the onCleanup parameter; simply taking the `WatchCallback` out and calling it doesn't make it easy to implement the `onCleanup` parameter.

Using `watchTriggerable` will solve this problem.

```ts
import { watchTriggerable } from '@vueuse/core'
import { shallowRef } from 'vue'

const source = shallowRef(0)

const { trigger } = watchTriggerable(
  source,
  async (v, _, onCleanup) => {
    let canceled = false
    onCleanup(() => canceled = true)

    await new Promise(resolve => setTimeout(resolve, 500))
    if (canceled)
      return

    console.log(`The value is "${v}"\n`)
  },
)

source.value = 1 // no log
await trigger() // logs (after 500 ms): The value is "1"
```

## Type Declarations

```ts
export interface WatchTriggerableReturn<
  FnReturnT = void,
> extends WatchIgnorableReturn {
  /** Execute `WatchCallback` immediately */
  trigger: () => FnReturnT
}
type OnCleanup = (cleanupFn: () => void) => void
export type WatchTriggerableCallback<V = any, OV = any, R = void> = (
  value: V,
  oldValue: OV,
  onCleanup: OnCleanup,
) => R
export declare function watchTriggerable<
  T extends Readonly<MultiWatchSources>,
  FnReturnT,
>(
  sources: [...T],
  cb: WatchTriggerableCallback<
    MapSources<T>,
    MapOldSources<T, true>,
    FnReturnT
  >,
  options?: WatchWithFilterOptions<boolean>,
): WatchTriggerableReturn<FnReturnT>
export declare function watchTriggerable<T, FnReturnT>(
  source: WatchSource<T>,
  cb: WatchTriggerableCallback<T, T | undefined, FnReturnT>,
  options?: WatchWithFilterOptions<boolean>,
): WatchTriggerableReturn<FnReturnT>
export declare function watchTriggerable<T extends object, FnReturnT>(
  source: T,
  cb: WatchTriggerableCallback<T, T | undefined, FnReturnT>,
  options?: WatchWithFilterOptions<boolean>,
): WatchTriggerableReturn<FnReturnT>
```
