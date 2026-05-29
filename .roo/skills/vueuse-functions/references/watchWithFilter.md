---
category: Watch
---

# watchWithFilter

`watch` with additional EventFilter control.

## Usage

Similar to `watch`, but offering an extra option `eventFilter` which will be applied to the callback function.

```ts
import { debounceFilter, watchWithFilter } from '@vueuse/core'

watchWithFilter(
  source,
  () => { console.log('changed!') }, // callback will be called in 500ms debounced manner
  {
    eventFilter: debounceFilter(500), // throttledFilter, pausableFilter or custom filters
  },
)
```

## Type Declarations

```ts
export interface WatchWithFilterOptions<Immediate>
  extends WatchOptions<Immediate>, ConfigurableEventFilter {}
export declare function watchWithFilter<
  T extends Readonly<MultiWatchSources>,
  Immediate extends Readonly<boolean> = false,
>(
  sources: [...T],
  cb: WatchCallback<MapSources<T>, MapOldSources<T, Immediate>>,
  options?: WatchWithFilterOptions<Immediate>,
): WatchHandle
export declare function watchWithFilter<
  T,
  Immediate extends Readonly<boolean> = false,
>(
  source: WatchSource<T>,
  cb: WatchCallback<T, Immediate extends true ? T | undefined : T>,
  options?: WatchWithFilterOptions<Immediate>,
): WatchHandle
export declare function watchWithFilter<
  T extends object,
  Immediate extends Readonly<boolean> = false,
>(
  source: T,
  cb: WatchCallback<T, Immediate extends true ? T | undefined : T>,
  options?: WatchWithFilterOptions<Immediate>,
): WatchHandle
```
