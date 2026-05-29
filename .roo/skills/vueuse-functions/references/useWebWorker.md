---
category: Browser
related: useWebWorkerFn
---

# useWebWorker

Simple [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) registration and communication.

## Usage

```ts
import { useWebWorker } from '@vueuse/core'

const { data, post, terminate, worker } = useWebWorker('/path/to/worker.js')
```

| State  | Type                              | Description                                                                                          |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| data   | `Ref<any>`                        | Reference to the latest data received via the worker, can be watched to respond to incoming messages |
| worker | `ShallowRef<Worker \| undefined>` | Reference to the instance of the WebWorker                                                           |

| Method    | Signature                                                                                                                     | Description                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| post      | `(message: any, transfer: Transferable[]): void`<br>`(message: any, options?: StructuredSerializeOptions \| undefined): void` | Sends data to the worker thread. |
| terminate | `() => void`                                                                                                                  | Stops and terminates the worker. |

## Type Declarations

```ts
type PostMessage = (typeof Worker.prototype)['postMessage']
export interface UseWebWorkerReturn<Data = any> {
  data: Ref<Data>
  post: PostMessage
  terminate: () => void
  worker: ShallowRef<Worker | undefined>
}
type WorkerFn = (...args: unknown[]) => Worker
/**
 * Simple Web Workers registration and communication.
 *
 * @see https://vueuse.org/useWebWorker
 * @param url
 * @param workerOptions
 * @param options
 */
export declare function useWebWorker<T = any>(
  url: string,
  workerOptions?: WorkerOptions,
  options?: ConfigurableWindow,
): UseWebWorkerReturn<T>
/**
 * Simple Web Workers registration and communication.
 *
 * @see https://vueuse.org/useWebWorker
 */
export declare function useWebWorker<T = any>(
  worker: Worker | WorkerFn,
): UseWebWorkerReturn<T>
```
