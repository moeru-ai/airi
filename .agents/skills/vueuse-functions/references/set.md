---
category: Utilities
---

# set

Shorthand for `ref.value = x`

## Usage

```ts
import { set } from '@vueuse/core'

const a = ref(0)

set(a, 1)

console.log(a.value) // 1
```

## Type Declarations

```ts
export declare function set<T>(ref: Ref<T>, value: T): void
export declare function set<O extends object, K extends keyof O>(
  target: O,
  key: K,
  value: O[K],
): void
```
