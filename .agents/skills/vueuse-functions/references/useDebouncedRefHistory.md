---
category: State
related:
  - useRefHistory
  - useThrottledRefHistory
---

# useDebouncedRefHistory

Shorthand for `useRefHistory` with debounced filter.

## Usage

This function takes a snapshot of your counter after 1000ms when the value of it starts to change.

```ts
import { useDebouncedRefHistory } from '@vueuse/core'
import { shallowRef } from 'vue'

const counter = shallowRef(0)
const { history, undo, redo } = useDebouncedRefHistory(counter, { deep: true, debounce: 1000 })
```

## Type Declarations

```ts
/**
 * Shorthand for [useRefHistory](https://vueuse.org/useRefHistory) with debounce filter.
 *
 * @see https://vueuse.org/useDebouncedRefHistory
 * @param source
 * @param options
 */
export declare function useDebouncedRefHistory<Raw, Serialized = Raw>(
  source: Ref<Raw>,
  options?: Omit<UseRefHistoryOptions<Raw, Serialized>, "eventFilter"> & {
    debounce?: MaybeRefOrGetter<number>
  },
): UseRefHistoryReturn<Raw, Serialized>
```
