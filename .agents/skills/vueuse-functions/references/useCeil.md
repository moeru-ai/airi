---
category: '@Math'
---

# useCeil

Reactive `Math.ceil`

## Usage

```ts
import { useCeil } from '@vueuse/math'

const value = ref(0.95)
const result = useCeil(value) // 1
```

## Type Declarations

```ts
/**
 * Reactive `Math.ceil`.
 *
 * @see https://vueuse.org/useCeil
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useCeil(
  value: MaybeRefOrGetter<number>,
): ComputedRef<number>
```
