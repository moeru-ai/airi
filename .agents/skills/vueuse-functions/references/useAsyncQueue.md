---
category: Utilities
---

# useAsyncQueue

Executes each asynchronous task sequentially and passes the current task result to the next task.

## Usage

```ts
import { useAsyncQueue } from '@vueuse/core'

function p1() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(1000)
    }, 10)
  })
}

function p2(result: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(1000 + result)
    }, 20)
  })
}

const { activeIndex, result } = useAsyncQueue([p1, p2])

console.log(activeIndex.value) // current pending task index

console.log(result) // the tasks result
```

### Result State

Each task in the result array has a `state` and `data` property:

```ts
interface UseAsyncQueueResult<T> {
  state: 'aborted' | 'fulfilled' | 'pending' | 'rejected'
  data: T | null
}
```

### Interrupt on Failure

By default, if a task fails, subsequent tasks will not be executed. Set `interrupt: false` to continue executing even after failures.

```ts
const { result } = useAsyncQueue([p1, p2], {
  interrupt: false, // continue even if p1 fails
})
```

### Callbacks

```ts
const { result } = useAsyncQueue([p1, p2], {
  onError() {
    console.log('A task failed')
  },
  onFinished() {
    console.log('All tasks completed (or interrupted)')
  },
})
```

### Abort Signal

You can pass an `AbortSignal` to cancel the queue execution.

```ts
const controller = new AbortController()

const { result } = useAsyncQueue([p1, p2], {
  signal: controller.signal,
})

// Later, abort the queue
controller.abort()
```

## Type Declarations

```ts
export type UseAsyncQueueTask<T> = (...args: any[]) => T | Promise<T>
type MapQueueTask<T extends any[]> = {
  [K in keyof T]: UseAsyncQueueTask<T[K]>
}
export interface UseAsyncQueueResult<T> {
  state: "aborted" | "fulfilled" | "pending" | "rejected"
  data: T | null
}
export interface UseAsyncQueueReturn<T> {
  activeIndex: ShallowRef<number>
  result: T
}
export interface UseAsyncQueueOptions {
  /**
   * Interrupt tasks when current task fails.
   *
   * @default true
   */
  interrupt?: boolean
  /**
   * Trigger it when the tasks fails.
   *
   */
  onError?: () => void
  /**
   * Trigger it when the tasks ends.
   *
   */
  onFinished?: () => void
  /**
   * A AbortSignal that can be used to abort the task.
   */
  signal?: AbortSignal
}
/**
 * Asynchronous queue task controller.
 *
 * @see https://vueuse.org/useAsyncQueue
 * @param tasks
 * @param options
 */
export declare function useAsyncQueue<T extends any[], S = MapQueueTask<T>>(
  tasks: S & Array<UseAsyncQueueTask<any>>,
  options?: UseAsyncQueueOptions,
): UseAsyncQueueReturn<{
  [P in keyof T]: UseAsyncQueueResult<T[P]>
}>
```
