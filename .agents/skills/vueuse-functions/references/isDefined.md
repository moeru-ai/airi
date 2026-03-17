---
category: Utilities
---

# isDefined

Non-nullish checking type guard for Ref.

## Usage

```ts
import { isDefined } from '@vueuse/core'

const example = ref(Math.random() ? 'example' : undefined) // Ref<string | undefined>

if (isDefined(example))
  example // Ref<string>
```

## Type Declarations

```ts
export type IsDefinedReturn = boolean
export declare function isDefined<T>(
  v: ComputedRef<T>,
): v is ComputedRef<Exclude<T, null | undefined>>
export declare function isDefined<T>(
  v: Ref<T>,
): v is Ref<Exclude<T, null | undefined>>
export declare function isDefined<T>(v: T): v is Exclude<T, null | undefined>
```
