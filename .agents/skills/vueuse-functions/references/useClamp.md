---
category: '@Math'
---

# useClamp

Reactively clamp a value between two other values.

## Usage

```ts
import { useClamp } from '@vueuse/math'

const min = shallowRef(0)
const max = shallowRef(10)
const value = useClamp(0, min, max)
```

### Writable Ref

When you pass a mutable `ref`, the returned value is a **writable computed** that clamps values when setting:

```ts
import { useClamp } from '@vueuse/math'

const number = shallowRef(0)
const clamped = useClamp(number, 0, 10)

clamped.value = 15 // clamped.value will be 10
clamped.value = -5 // clamped.value will be 0
```

### Read-only Mode

When you pass a getter function or readonly ref, the returned value is a read-only computed:

```ts
import { useClamp } from '@vueuse/math'

const value = ref(5)
const clamped = useClamp(() => value.value * 2, 0, 10)

// clamped.value is computed from the getter
```

### Reactive Bounds

All arguments (value, min, max) can be reactive:

```ts
import { useClamp } from '@vueuse/math'

const value = shallowRef(5)
const min = shallowRef(0)
const max = shallowRef(10)

const clamped = useClamp(value, min, max)

max.value = 3 // clamped.value automatically becomes 3
```

## Type Declarations

```ts
/**
 * Reactively clamp a value between two other values.
 *
 * @see https://vueuse.org/useClamp
 * @param value number
 * @param min
 * @param max
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useClamp(
  value: ReadonlyRefOrGetter<number>,
  min: MaybeRefOrGetter<number>,
  max: MaybeRefOrGetter<number>,
): ComputedRef<number>
export declare function useClamp(
  value: MaybeRefOrGetter<number>,
  min: MaybeRefOrGetter<number>,
  max: MaybeRefOrGetter<number>,
): Ref<number>
```
