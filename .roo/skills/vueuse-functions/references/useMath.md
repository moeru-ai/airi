---
category: '@Math'
---

# useMath

Reactive `Math` methods.

## Usage

```ts
import { useMath } from '@vueuse/math'

const base = ref(2)
const exponent = ref(3)
const result = useMath('pow', base, exponent) // Ref<8>

const num = ref(2)
const root = useMath('sqrt', num) // Ref<1.4142135623730951>

num.value = 4
console.log(root.value) // 2
```

## Type Declarations

```ts
export type UseMathKeys = keyof {
  [K in keyof Math as Math[K] extends (...args: any) => any
    ? K
    : never]: unknown
}
export type UseMathReturn<K extends keyof Math> = ReturnType<
  Reactified<Math[K], true>
>
/**
 * Reactive `Math` methods.
 *
 * @see https://vueuse.org/useMath
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useMath<K extends keyof Math>(
  key: K,
  ...args: ArgumentsType<Reactified<Math[K], true>>
): UseMathReturn<K>
```
