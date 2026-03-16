---
category: '@Math'
---

# useAbs

Reactive `Math.abs`.

## Usage

```ts
import { useAbs } from '@vueuse/math'

const value = ref(-23)
const absValue = useAbs(value) // Ref<23>
```

## Type Declarations

```ts
/**
 * Reactive `Math.abs`.
 *
 * @see https://vueuse.org/useAbs
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useAbs(
  value: MaybeRefOrGetter<number>,
): ComputedRef<number>
```
