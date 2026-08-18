---
category: Utilities
---

# useTimeoutPoll

Use timeout to poll something. It will trigger callback after last task is done.

## Usage

```ts
import { useTimeoutPoll } from '@vueuse/core'

const count = ref(0)

async function fetchData() {
  await new Promise(resolve => setTimeout(resolve, 1000))
  count.value++
}

// Only trigger after last fetch is done
const { isActive, pause, resume } = useTimeoutPoll(fetchData, 1000)
```

## Type Declarations

```ts
export interface UseTimeoutPollOptions {
  /**
   * Start the timer immediately
   *
   * @default true
   */
  immediate?: boolean
  /**
   * Execute the callback immediately after calling `resume`
   *
   * @default false
   */
  immediateCallback?: boolean
}
export declare function useTimeoutPoll(
  fn: () => Awaitable<void>,
  interval: MaybeRefOrGetter<number>,
  options?: UseTimeoutFnOptions,
): Pausable
```
