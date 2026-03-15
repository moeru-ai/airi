---
category: Component
---

# tryOnMounted

Safe `onMounted`. Call `onMounted()` if it's inside a component lifecycle, if not, just call the function

## Usage

```ts
import { tryOnMounted } from '@vueuse/core'

tryOnMounted(() => {

})
```

## Type Declarations

```ts
/**
 * Call onMounted() if it's inside a component lifecycle, if not, just call the function
 *
 * @param fn
 * @param sync if set to false, it will run in the nextTick() of Vue
 * @param target
 */
export declare function tryOnMounted(
  fn: Fn,
  sync?: boolean,
  target?: ComponentInternalInstance | null,
): void
```
