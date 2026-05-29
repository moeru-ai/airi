---
category: State
related: createSharedComposable
---

# createGlobalState

Keep states in the global scope to be reusable across Vue instances.

## Usage

### Without Persistence (Store in Memory)

```ts
// store.ts
import { createGlobalState } from '@vueuse/core'
import { shallowRef } from 'vue'

export const useGlobalState = createGlobalState(
  () => {
    const count = shallowRef(0)
    return { count }
  }
)
```

A bigger example:

```ts
// store.ts
import { createGlobalState } from '@vueuse/core'
import { computed, shallowRef } from 'vue'

export const useGlobalState = createGlobalState(
  () => {
    // state
    const count = shallowRef(0)

    // getters
    const doubleCount = computed(() => count.value * 2)

    // actions
    function increment() {
      count.value++
    }

    return { count, doubleCount, increment }
  }
)
```

### With Persistence

Store in `localStorage` with `useStorage`:

```ts twoslash include store
// store.ts
import { createGlobalState, useStorage } from '@vueuse/core'

export const useGlobalState = createGlobalState(
  () => useStorage('vueuse-local-storage', 'initialValue'),
)
```

```ts
// @filename: store.ts
// @include: store
// ---cut---
// component.ts
import { useGlobalState } from './store'

export default defineComponent({
  setup() {
    const state = useGlobalState()
    return { state }
  },
})
```

## Type Declarations

```ts
export type CreateGlobalStateReturn<Fn extends AnyFn = AnyFn> = Fn
/**
 * Keep states in the global scope to be reusable across Vue instances.
 *
 * @see https://vueuse.org/createGlobalState
 * @param stateFactory A factory function to create the state
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function createGlobalState<Fn extends AnyFn>(
  stateFactory: Fn,
): CreateGlobalStateReturn<Fn>
```
