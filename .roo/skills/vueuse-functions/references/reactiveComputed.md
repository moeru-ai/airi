---
category: Reactivity
---

# reactiveComputed

Computed reactive object. Instead of returning a ref that `computed` does, `reactiveComputed` returns a reactive object.

## Usage

```ts
import { reactiveComputed } from '@vueuse/core'

const state = reactiveComputed(() => {
  return {
    foo: 'bar',
    bar: 'baz',
  }
})

state.bar // 'baz'
```

## Type Declarations

```ts
export type ReactiveComputedReturn<T extends object> = UnwrapNestedRefs<T>
/**
 * Computed reactive object.
 */
export declare function reactiveComputed<T extends object>(
  fn: ComputedGetter<T>,
): ReactiveComputedReturn<T>
```
