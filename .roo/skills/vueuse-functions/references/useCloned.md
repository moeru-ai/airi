---
category: Utilities
---

# useCloned

Reactive clone of a ref. By default, it use `JSON.parse(JSON.stringify())` to do the clone.

## Usage

```ts
import { useCloned } from '@vueuse/core'

const original = ref({ key: 'value' })

const { cloned } = useCloned(original)

original.value.key = 'some new value'

console.log(cloned.value.key) // 'value'
```

## Manual cloning

```ts
import { useCloned } from '@vueuse/core'

const original = ref({ key: 'value' })

const { cloned, sync } = useCloned(original, { manual: true })

original.value.key = 'manual'

console.log(cloned.value.key) // 'value'

sync()

console.log(cloned.value.key)// 'manual'
```

## Custom Clone Function

Using [`klona`](https://www.npmjs.com/package/klona) for example:

```ts
import { useCloned } from '@vueuse/core'
import { klona } from 'klona'

const original = ref({ key: 'value' })

const { cloned, isModified, sync } = useCloned(original, { clone: klona })
```

## Type Declarations

```ts
export interface UseClonedOptions<T = any> extends WatchOptions {
  /**
   * Custom clone function.
   *
   * By default, it use `JSON.parse(JSON.stringify(value))` to clone.
   */
  clone?: (source: T) => T
  /**
   * Manually sync the ref
   *
   * @default false
   */
  manual?: boolean
}
export interface UseClonedReturn<T> {
  /**
   * Cloned ref
   */
  cloned: Ref<T>
  /**
   * Ref indicates whether the cloned data is modified
   */
  isModified: Ref<boolean>
  /**
   * Sync cloned data with source manually
   */
  sync: () => void
}
export type CloneFn<F, T = F> = (x: F) => T
export declare function cloneFnJSON<T>(source: T): T
export declare function useCloned<T>(
  source: MaybeRefOrGetter<T>,
  options?: UseClonedOptions,
): UseClonedReturn<T>
```
