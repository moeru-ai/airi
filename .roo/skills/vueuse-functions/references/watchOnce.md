---
category: Watch
---

# watchOnce

Shorthand for watching value with `{ once: true }`. Once the callback fires once, the watcher will be stopped.
See [Vue's docs](https://vuejs.org/guide/essentials/watchers.html#once-watchers) for full details.

## Usage

Similar to `watch`, but with `{ once: true }`

```ts
import { watchOnce } from '@vueuse/core'

watchOnce(source, () => {
  // triggers only once
  console.log('source changed!')
})
```

## Type Declarations

```ts
export declare function watchOnce<T extends Readonly<MultiWatchSources>>(
  source: [...T],
  cb: WatchCallback<MapSources<T>, MapOldSources<T, true>>,
  options?: Omit<WatchOptions<true>, 'once'>,
): WatchHandle
export declare function watchOnce<T>(
  source: WatchSource<T>,
  cb: WatchCallback<T, T | undefined>,
  options?: Omit<WatchOptions<true>, 'once'>,
): WatchHandle
export declare function watchOnce<T extends object>(
  source: T,
  cb: WatchCallback<T, T | undefined>,
  options?: Omit<WatchOptions<true>, 'once'>,
): WatchHandle
```
