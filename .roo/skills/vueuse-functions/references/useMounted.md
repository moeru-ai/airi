---
category: Component
---

# useMounted

Mounted state in ref.

## Usage

```ts
import { useMounted } from '@vueuse/core'

const isMounted = useMounted()
```

Which is essentially a shorthand of:

```ts
const isMounted = ref(false)

onMounted(() => {
  isMounted.value = true
})
```

## Type Declarations

```ts
/**
 * Mounted state in ref.
 *
 * @see https://vueuse.org/useMounted
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useMounted(): ShallowRef<boolean, boolean>
```
