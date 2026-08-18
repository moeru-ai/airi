---
category: Utilities
---

# get

Shorthand for accessing `ref.value`

## Usage

```ts
import { get } from '@vueuse/core'

const a = ref(42)

console.log(get(a)) // 42
```

## Type Declarations

```ts
/**
 * Shorthand for accessing `ref.value`
 */
export declare function get<T>(ref: MaybeRef<T>): T
export declare function get<T, K extends keyof T>(
  ref: MaybeRef<T>,
  key: K,
): T[K]
```
