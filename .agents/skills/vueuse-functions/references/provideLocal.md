---
category: State
---

# provideLocal

Extended `provide` with ability to call `injectLocal` to obtain the value in the same component.

## Usage

```vue
<script setup>
import { injectLocal, provideLocal } from '@vueuse/core'

provideLocal('MyInjectionKey', 1)
const injectedValue = injectLocal('MyInjectionKey') // injectedValue === 1
</script>
```

## Type Declarations

```ts
export type ProvideLocalReturn = void
/**
 * On the basis of `provide`, it is allowed to directly call inject to obtain the value after call provide in the same component.
 *
 * @example
 * ```ts
 * provideLocal('MyInjectionKey', 1)
 * const injectedValue = injectLocal('MyInjectionKey') // injectedValue === 1
 * ```
 */
export declare function provideLocal<T, K = LocalProvidedKey<T>>(
  key: K,
  value: K extends InjectionKey<infer V> ? V : T,
): ProvideLocalReturn
```
