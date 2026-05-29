---
category: Component
---

# tryOnUnmounted

Safe `onUnmounted`. Call `onUnmounted()` if it's inside a component lifecycle, if not, do nothing

## Usage

```ts
import { tryOnUnmounted } from '@vueuse/core'

tryOnUnmounted(() => {

})
```

## Type Declarations

```ts
/**
 * Call onUnmounted() if it's inside a component lifecycle, if not, do nothing
 *
 * @param fn
 * @param target
 */
export declare function tryOnUnmounted(
  fn: Fn,
  target?: ComponentInternalInstance | null,
): void
```
