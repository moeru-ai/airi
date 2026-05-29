---
category: '@Math'
---

# useFloor

Reactive `Math.floor`.

## Usage

```ts
import { useFloor } from '@vueuse/math'

const value = ref(45.95)
const result = useFloor(value) // 45
```

## Type Declarations

```ts
/**
 * Reactive `Math.floor`
 *
 * @see https://vueuse.org/useFloor
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useFloor(
  value: MaybeRefOrGetter<number>,
): ComputedRef<number>
```
