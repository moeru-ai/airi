---
category: Reactivity
---

# refDefault

Apply default value to a ref.

## Usage

```ts
import { refDefault, useStorage } from '@vueuse/core'

const raw = useStorage('key')
const state = refDefault(raw, 'default')

raw.value = 'hello'
console.log(state.value) // hello

raw.value = undefined
console.log(state.value) // default
```

## Type Declarations

```ts
/**
 * Apply default value to a ref.
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function refDefault<T>(
  source: Ref<T | undefined | null>,
  defaultValue: T,
): Ref<T>
```
