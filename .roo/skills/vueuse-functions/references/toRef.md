---
category: Reactivity
alias: resolveRef
---

# toRef

Normalize value/ref/getter to `ref` or `computed`.

## Usage

```ts
import { toRef } from '@vueuse/core'

const foo = ref('hi')

const a = toRef(0) // Ref<number>
const b = toRef(foo) // Ref<string>
const c = toRef(() => 'hi') // ComputedRef<string>
```

## Differences from Vue's `toRef`

VueUse's `toRef` is not the same as Vue’s `toRef` from the `vue` package.

### VueUse `toRef`

- Accepts **value**, **ref**, or **getter**
- Returns:
  - a **ref** for primitive values
  - a **ref** for existing refs
  - a **computed** for getter functions
- Does **not** accept `object + key`
- Getters always produce readonly computed values

### Vue `toRef`

- Accepts only:
  - a **reactive object + property key**, or
  - an existing **ref**
- Produces a **writable ref** linked to the underlying reactive object
- Does **not** accept primitive values
- Does **not** accept getter functions

### Summary

| Behavior                 | VueUse `toRef`            | Vue `toRef`             |
| ------------------------ | ------------------------- | ----------------------- |
| Accepts primitive values | ✔️                        | ❌                      |
| Accepts getter           | ✔️ (computed)             | ❌                      |
| Accepts existing ref     | ✔️                        | ✔️                      |
| Accepts object + key     | ❌                        | ✔️                      |
| Writable                 | ✔️ (except getter)        | ✔️                      |
| Purpose                  | Normalize to ref/computed | Bind to reactive object |

## Type Declarations

```ts
/**
 * Normalize value/ref/getter to `ref` or `computed`.
 */
export declare function toRef<T>(r: () => T): Readonly<Ref<T>>
export declare function toRef<T>(r: ComputedRef<T>): ComputedRef<T>
export declare function toRef<T>(r: MaybeRefOrGetter<T>): Ref<T>
export declare function toRef<T>(r: T): Ref<T>
export declare function toRef<T extends object, K extends keyof T>(
  object: T,
  key: K,
): ToRef<T[K]>
export declare function toRef<T extends object, K extends keyof T>(
  object: T,
  key: K,
  defaultValue: T[K],
): ToRef<Exclude<T[K], undefined>>
```
