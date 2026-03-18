---
category: '@Math'
---

# useMax

Reactive `Math.max`.

## Usage

```ts
import { useMax } from '@vueuse/math'

const array = ref([1, 2, 3, 4])
const max = useMax(array) // Ref<4>
```

```ts
import { useMax } from '@vueuse/math'

const a = ref(1)
const b = ref(3)

const max = useMax(a, b, 2) // Ref<3>
```

## Type Declarations

```ts
export declare function useMax(
  array: MaybeRefOrGetter<MaybeRefOrGetter<number>[]>,
): ComputedRef<number>
export declare function useMax(
  ...args: MaybeRefOrGetter<number>[]
): ComputedRef<number>
```
