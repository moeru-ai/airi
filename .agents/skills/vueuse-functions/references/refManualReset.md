---
category: Reactivity
---

# refManualReset

Create a ref with manual reset functionality.

## Usage

```ts
import { refManualReset } from '@vueuse/core'

const message = refManualReset('default message')

message.value = 'message has set'

message.reset()

console.log(message.value) // 'default message'
```

> [!NOTE]
> `refManualReset` is shallow, which may cause your UI not updated on value changes.
> Wrap your value with `reactive` can achieve deep reactivity, but this workaround may not suit all use cases.

## Type Declarations

```ts
/**
 * Define the shape of a ref that supports manual reset functionality.
 *
 * This interface extends the standard `Ref` type from Vue and adds a `reset` method.
 * The `reset` method allows the ref to be manually reset to its default value.
 */
export interface ManualResetRefReturn<T> extends Ref<T> {
  reset: Fn
}
/**
 * Create a ref with manual reset functionality.
 *
 * @see https://vueuse.org/refManualReset
 * @param defaultValue The value which will be set.
 */
export declare function refManualReset<T>(
  defaultValue: MaybeRefOrGetter<T>,
): ManualResetRefReturn<T>
```
