---
category: Watch
---

# watchArray

Watch for an array with additions and removals.

## Usage

Similar to `watch`, but provides the added and removed elements to the callback function. Pass `{ deep: true }` if the list is updated in place with `push`, `splice`, etc.

```ts
import { watchArray } from '@vueuse/core'

const list = ref([1, 2, 3])

watchArray(list, (newList, oldList, added, removed) => {
  console.log(newList) // [1, 2, 3, 4]
  console.log(oldList) // [1, 2, 3]
  console.log(added) // [4]
  console.log(removed) // []
})

onMounted(() => {
  list.value = [...list.value, 4]
})
```

## Type Declarations

```ts
export declare type WatchArrayCallback<V = any, OV = any> = (
  value: V,
  oldValue: OV,
  added: V,
  removed: OV,
  onCleanup: (cleanupFn: () => void) => void,
) => any
/**
 * Watch for an array with additions and removals.
 *
 * @see https://vueuse.org/watchArray
 */
export declare function watchArray<
  T,
  Immediate extends Readonly<boolean> = false,
>(
  source: WatchSource<T[]> | T[],
  cb: WatchArrayCallback<T[], Immediate extends true ? T[] | undefined : T[]>,
  options?: WatchOptions<Immediate>,
): WatchHandle
```
