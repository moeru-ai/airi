---
category: Watch
---

# watchAtMost

`watch` with the number of times triggered.

## Usage

Similar to `watch` with an extra option `count` which set up the number of times the callback function is triggered. After the count is reached, the watch will be stopped automatically.

```ts
import { watchAtMost } from '@vueuse/core'

watchAtMost(
  source,
  () => { console.log('trigger!') }, // triggered it at most 3 times
  {
    count: 3, // the number of times triggered
  },
)
```

## Type Declarations

```ts
export interface WatchAtMostOptions<
  Immediate,
> extends WatchWithFilterOptions<Immediate> {
  count: MaybeRefOrGetter<number>
}
export interface WatchAtMostReturn {
  stop: WatchStopHandle
  pause: () => void
  resume: () => void
  count: ShallowRef<number>
}
export declare function watchAtMost<
  T extends Readonly<MultiWatchSources>,
  Immediate extends Readonly<boolean> = false,
>(
  sources: [...T],
  cb: WatchCallback<MapSources<T>, MapOldSources<T, Immediate>>,
  options: WatchAtMostOptions<Immediate>,
): WatchAtMostReturn
export declare function watchAtMost<
  T,
  Immediate extends Readonly<boolean> = false,
>(
  sources: WatchSource<T>,
  cb: WatchCallback<T, Immediate extends true ? T | undefined : T>,
  options: WatchAtMostOptions<Immediate>,
): WatchAtMostReturn
```
