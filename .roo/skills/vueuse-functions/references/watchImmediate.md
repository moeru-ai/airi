---
category: Watch
---

# watchImmediate

Shorthand for watching value with `{immediate: true}`

## Usage

Similar to `watch`, but with `{ immediate: true }`

```ts
import { watchImmediate } from '@vueuse/core'

const obj = ref('vue-use')

// changing the value from some external store/composables
obj.value = 'VueUse'

watchImmediate(obj, (updated) => {
  console.log(updated) // Console.log will be logged twice
})
```

## Type Declarations

```ts
export declare function watchImmediate<T extends Readonly<MultiWatchSources>>(
  source: [...T],
  cb: WatchCallback<MapSources<T>, MapOldSources<T, true>>,
  options?: Omit<WatchOptions<true>, 'immediate'>,
): WatchHandle
export declare function watchImmediate<T>(
  source: WatchSource<T>,
  cb: WatchCallback<T, T | undefined>,
  options?: Omit<WatchOptions<true>, 'immediate'>,
): WatchHandle
export declare function watchImmediate<T extends object>(
  source: T,
  cb: WatchCallback<T, T | undefined>,
  options?: Omit<WatchOptions<true>, 'immediate'>,
): WatchHandle
```
