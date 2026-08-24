---
category: Browser
---

# useWebWorkerFn

Run expensive functions without blocking the UI, using a simple syntax that makes use of Promise. A port of [alewin/useWorker](https://github.com/alewin/useWorker).

## Usage

### Basic example

```ts
import { useWebWorkerFn } from '@vueuse/core'

const { workerFn } = useWebWorkerFn(() => {
  // some heavy works to do in web worker
})
```

### With dependencies

```ts {7-9}
import { useWebWorkerFn } from '@vueuse/core'

const { workerFn, workerStatus, workerTerminate } = useWebWorkerFn(
  dates => dates.sort(dateFns.compareAsc),
  {
    timeout: 50000,
    dependencies: [
      'https://cdnjs.cloudflare.com/ajax/libs/date-fns/1.30.1/date_fns.js', // dateFns
    ],
  },
)
```

### With local dependencies

```ts {9-9}
import { useWebWorkerFn } from '@vueuse/core'

const pow = (a: number) => a * a

const { workerFn, workerStatus, workerTerminate } = useWebWorkerFn(
  numbers => pow(numbers),
  {
    timeout: 50000,
    localDependencies: [pow]
  },
)
```

## Web Worker

Before you start using this function, we suggest you read the [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) documentation.

## Credit

This function is a Vue port of https://github.com/alewin/useWorker by Alessio Koci, with the help of [@Donskelle](https://github.com/Donskelle) to migration.

## Type Declarations

```ts
export type WebWorkerStatus =
  | "PENDING"
  | "SUCCESS"
  | "RUNNING"
  | "ERROR"
  | "TIMEOUT_EXPIRED"
export interface UseWebWorkerOptions extends ConfigurableWindow {
  /**
   * Number of milliseconds before killing the worker
   *
   * @default undefined
   */
  timeout?: number
  /**
   * An array that contains the external dependencies needed to run the worker
   */
  dependencies?: string[]
  /**
   * An array that contains the local dependencies needed to run the worker
   */
  localDependencies?: Function[]
}
export interface UseWebWorkerFnReturn<T extends (...fnArgs: any[]) => any> {
  workerFn: (...fnArgs: Parameters<T>) => Promise<ReturnType<T>>
  workerStatus: ShallowRef<WebWorkerStatus>
  workerTerminate: (status?: WebWorkerStatus) => void
}
/**
 * Run expensive function without blocking the UI, using a simple syntax that makes use of Promise.
 *
 * @see https://vueuse.org/useWebWorkerFn
 * @param fn
 * @param options
 */
export declare function useWebWorkerFn<T extends (...fnArgs: any[]) => any>(
  fn: T,
  options?: UseWebWorkerOptions,
): UseWebWorkerFnReturn<T>
```
