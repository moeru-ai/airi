---
category: State
related: useDebouncedRefHistory, useRefHistory
---

# useThrottledRefHistory

Shorthand for `useRefHistory` with throttled filter.

## Usage

This function takes the first snapshot right after the counter's value was changed and the second with a delay of 1000ms.

```ts
import { useThrottledRefHistory } from '@vueuse/core'
import { shallowRef } from 'vue'

const counter = shallowRef(0)
const { history, undo, redo } = useThrottledRefHistory(counter, { deep: true, throttle: 1000 })
```

## Type Declarations

```ts
export type UseThrottledRefHistoryOptions<Raw, Serialized = Raw> = Omit<
  UseRefHistoryOptions<Raw, Serialized>,
  "eventFilter"
> & {
  throttle?: MaybeRef<number>
  trailing?: boolean
}
export type UseThrottledRefHistoryReturn<
  Raw,
  Serialized = Raw,
> = UseRefHistoryReturn<Raw, Serialized>
/**
 * Shorthand for [useRefHistory](https://vueuse.org/useRefHistory) with throttled filter.
 *
 * @see https://vueuse.org/useThrottledRefHistory
 * @param source
 * @param options
 */
export declare function useThrottledRefHistory<Raw, Serialized = Raw>(
  source: Ref<Raw>,
  options?: UseThrottledRefHistoryOptions<Raw, Serialized>,
): UseThrottledRefHistoryReturn<Raw, Serialized>
```
