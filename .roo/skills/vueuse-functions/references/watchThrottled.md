---
category: Watch
alias: throttledWatch
---

# watchThrottled

Throttled watch. The callback will be invoked at most once per specified duration.

## Usage

Similar to `watch`, but offering extra options `throttle`, `trailing`, and `leading` which will be applied to the callback function.

```ts
import { watchThrottled } from '@vueuse/core'

watchThrottled(
  source,
  () => { console.log('changed!') },
  { throttle: 500 },
)
```

### Options

| Option     | Type                       | Default | Description                               |
| ---------- | -------------------------- | ------- | ----------------------------------------- |
| `throttle` | `MaybeRefOrGetter<number>` | `0`     | Throttle interval in ms (can be reactive) |
| `trailing` | `boolean`                  | `true`  | Invoke on the trailing edge               |
| `leading`  | `boolean`                  | `true`  | Invoke on the leading edge                |

All standard `watch` options (`deep`, `immediate`, `flush`, etc.) are also supported.

### Leading and Trailing

Control when the callback is invoked:

```ts
import { watchThrottled } from '@vueuse/core'

// Only invoke at the start of each throttle period
watchThrottled(source, callback, {
  throttle: 500,
  leading: true,
  trailing: false,
})

// Only invoke at the end of each throttle period
watchThrottled(source, callback, {
  throttle: 500,
  leading: false,
  trailing: true,
})
```

## How It Works

It's essentially a shorthand for the following code:

```ts
import { throttleFilter, watchWithFilter } from '@vueuse/core'

watchWithFilter(
  source,
  () => { console.log('changed!') },
  {
    eventFilter: throttleFilter(500),
  },
)
```

## Type Declarations

```ts
export interface WatchThrottledOptions<
  Immediate,
> extends WatchOptions<Immediate> {
  throttle?: MaybeRefOrGetter<number>
  trailing?: boolean
  leading?: boolean
}
export declare function watchThrottled<
  T extends Readonly<MultiWatchSources>,
  Immediate extends Readonly<boolean> = false,
>(
  sources: [...T],
  cb: WatchCallback<MapSources<T>, MapOldSources<T, Immediate>>,
  options?: WatchThrottledOptions<Immediate>,
): WatchHandle
export declare function watchThrottled<
  T,
  Immediate extends Readonly<boolean> = false,
>(
  source: WatchSource<T>,
  cb: WatchCallback<T, Immediate extends true ? T | undefined : T>,
  options?: WatchThrottledOptions<Immediate>,
): WatchHandle
export declare function watchThrottled<
  T extends object,
  Immediate extends Readonly<boolean> = false,
>(
  source: T,
  cb: WatchCallback<T, Immediate extends true ? T | undefined : T>,
  options?: WatchThrottledOptions<Immediate>,
): WatchHandle
/** @deprecated use `watchThrottled` instead */
export declare const throttledWatch: typeof watchThrottled
```
