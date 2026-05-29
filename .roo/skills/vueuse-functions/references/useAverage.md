---
category: '@Math'
---

# useAverage

Get the average of an array reactively.

## Usage

```ts
import { useAverage } from '@vueuse/math'

const list = ref([1, 2, 3])
const averageValue = useAverage(list) // Ref<2>
```

```ts
import { useAverage } from '@vueuse/math'

const a = ref(1)
const b = ref(3)

const averageValue = useAverage(a, b) // Ref<2>
```

## Type Declarations

```ts
export declare function useAverage(
  array: MaybeRefOrGetter<MaybeRefOrGetter<number>[]>,
): ComputedRef<number>
export declare function useAverage(
  ...args: MaybeRefOrGetter<number>[]
): ComputedRef<number>
```
