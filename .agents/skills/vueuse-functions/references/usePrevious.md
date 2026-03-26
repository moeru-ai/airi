---
category: Utilities
---

# usePrevious

Holds the previous value of a ref.

## Usage

```ts
import { usePrevious } from '@vueuse/core'
import { shallowRef } from 'vue'

const counter = shallowRef('Hello')
const previous = usePrevious(counter)

console.log(previous.value) // undefined

counter.value = 'World'

console.log(previous.value) // Hello
```

## Type Declarations

```ts
/**
 * Holds the previous value of a ref.
 *
 * @see   {@link https://vueuse.org/usePrevious}
 */
export declare function usePrevious<T>(
  value: MaybeRefOrGetter<T>,
): Readonly<ShallowRef<T | undefined>>
export declare function usePrevious<T>(
  value: MaybeRefOrGetter<T>,
  initialValue: T,
): Readonly<ShallowRef<T>>
```
