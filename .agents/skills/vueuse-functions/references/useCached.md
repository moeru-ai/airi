---
category: Utilities
---

# useCached

Cache a ref with a custom comparator.

The comparator signature is `(newSourceValue, cachedValue) => boolean`.
When it returns `true`, the cache is kept as-is. When it returns `false`, the cache is updated to the new source value.

## Usage

```ts
import { useCached } from '@vueuse/core'
import { shallowRef } from 'vue'

interface Data {
  value: number
  extra: number
}

const source = shallowRef<Data>({ value: 42, extra: 0 })
const cached = useCached(source, (newSourceValue, cachedValue) => newSourceValue.value === cachedValue.value)

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
  comparator?: (newSourceValue: T, cachedValue: T) => boolean,
  options?: UseCachedOptions<D>,
): UseCachedReturn<T, D>
export type UseCachedReturn<
  T = any,
  D extends boolean = true,
> = ShallowOrDeepRef<T, D>
```
