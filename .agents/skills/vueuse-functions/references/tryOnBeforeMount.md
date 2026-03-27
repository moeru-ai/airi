---
category: Component
---

# tryOnBeforeMount

Safe `onBeforeMount`. Call `onBeforeMount()` if it's inside a component lifecycle, if not, just call the function

## Usage

```ts
import { tryOnBeforeMount } from '@vueuse/core'

tryOnBeforeMount(() => {

})
```

## Type Declarations

```ts
/**
 * Call onBeforeMount() if it's inside a component lifecycle, if not, just call the function
 *
 * @param fn
 * @param sync if set to false, it will run in the nextTick() of Vue
 * @param target
 */
export declare function tryOnBeforeMount(
  fn: Fn,
  sync?: boolean,
  target?: ComponentInternalInstance | null,
): void
```
