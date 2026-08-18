---
category: Component
---

# tryOnBeforeUnmount

Safe `onBeforeUnmount`. Call `onBeforeUnmount()` if it's inside a component lifecycle, if not, do nothing

## Usage

```ts
import { tryOnBeforeUnmount } from '@vueuse/core'

tryOnBeforeUnmount(() => {

})
```

## Type Declarations

```ts
/**
 * Call onBeforeUnmount() if it's inside a component lifecycle, if not, do nothing
 *
 * @param fn
 * @param target
 */
export declare function tryOnBeforeUnmount(
  fn: Fn,
  target?: ComponentInternalInstance | null,
): void
```
