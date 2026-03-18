---
category: Utilities
---

# useCached

Cache a ref with a custom comparator.

## Usage

```ts
import { useCached } from '@vueuse/core'
import { shallowRef } from 'vue'

interface Data {
  value: number
  extra: number
}

const source = shallowRef<Data>({ value: 42, extra: 0 })
const cached = useCached(source, (a, b) => a.value === b.value)

source.value = {
  value: 42,
  extra: 1,
}

console.log(cached.value) // { value: 42, extra: 0 }

source.value = {
  value: 43,
  extra: 1,
}

console.log(cached.value) // { value: 43, extra: 1 }
```

## Type Declarations

```ts
export interface UseCachedOptions<D extends boolean = true>
  extends ConfigurableDeepRefs<D>, WatchOptions {}
export declare function useCached<T, D extends boolean = true>(
  refValue: Ref<T>,
  comparator?: (a: T, b: T) => boolean,
  options?: UseCachedOptions<D>,
): UseCachedReturn<T, D>
export type UseCachedReturn<
  T = any,
  D extends boolean = true,
> = ShallowOrDeepRef<T, D>
```
