---
category: Reactivity
alias: autoResetRef
---

# refAutoReset

A ref which will be reset to the default value after some time.

## Usage

```ts
import { refAutoReset } from '@vueuse/core'

const message = refAutoReset('default message', 1000)

function setMessage() {
  // here the value will change to 'message has set' but after 1000ms, it will change to 'default message'
  message.value = 'message has set'
}
```

::: info
You can reassign the entire object to trigger updates after making deep mutations to the inner value.

[Learn more about shallow refs →](https://vuejs.org/api/reactivity-advanced#shallowref)
:::

## Type Declarations

```ts
export type RefAutoResetReturn<T = any> = Ref<T>
/**
 * Create a ref which will be reset to the default value after some time.
 *
 * @see https://vueuse.org/refAutoReset
 * @param defaultValue The value which will be set.
 * @param afterMs      A zero-or-greater delay in milliseconds.
 */
export declare function refAutoReset<T>(
  defaultValue: MaybeRefOrGetter<T>,
  afterMs?: MaybeRefOrGetter<number>,
): RefAutoResetReturn<T>
/** @deprecated use `refAutoReset` instead */
export declare const autoResetRef: typeof refAutoReset
```
