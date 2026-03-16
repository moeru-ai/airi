---
category: State
related: createGlobalState
---

# createSharedComposable

Make a composable function usable with multiple Vue instances.

> [!WARNING]
> When used in a **SSR** environment, `createSharedComposable` will **automatically fallback** to a non-shared version.
> This means every call will create a fresh instance in SSR to avoid [cross-request state pollution](https://vuejs.org/guide/scaling-up/ssr.html#cross-request-state-pollution).

## Usage

```ts
import { createSharedComposable, useMouse } from '@vueuse/core'

const useSharedMouse = createSharedComposable(useMouse)

// CompA.vue
const { x, y } = useSharedMouse()

// CompB.vue - will reuse the previous state and no new event listeners will be registered
const { x, y } = useSharedMouse()
```

## Type Declarations

```ts
export type SharedComposableReturn<T extends AnyFn = AnyFn> = T
/**
 * Make a composable function usable with multiple Vue instances.
 *
 * @see https://vueuse.org/createSharedComposable
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function createSharedComposable<Fn extends AnyFn>(
  composable: Fn,
): SharedComposableReturn<Fn>
```
