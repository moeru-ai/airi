---
category: Component
---

# tryOnScopeDispose

Safe `onScopeDispose`. Call `onScopeDispose()` if it's inside an effect scope lifecycle, if not, do nothing

## Usage

```ts
import { tryOnScopeDispose } from '@vueuse/core'

tryOnScopeDispose(() => {

})
```

## Type Declarations

```ts
/**
 * Call onScopeDispose() if it's inside an effect scope lifecycle, if not, do nothing
 *
 * @param fn
 */
export declare function tryOnScopeDispose(
  fn: Fn,
  failSilently?: boolean,
): boolean
```
