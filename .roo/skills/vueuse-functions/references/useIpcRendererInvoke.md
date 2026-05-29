---
category: '@Electron'
---

# useIpcRendererInvoke

Reactive [ipcRenderer.invoke API](https://www.electronjs.org/docs/api/ipc-renderer#ipcrendererinvokechannel-args) result. Make asynchronous operations look synchronous.

## Usage

```ts
import { useIpcRendererInvoke } from '@vueuse/electron'
import { computed } from 'vue'

// enable nodeIntegration if you don't provide ipcRenderer explicitly
// see: https://www.electronjs.org/docs/api/webview-tag#nodeintegration
// Ref result will return
const result = useIpcRendererInvoke<string>('custom-channel', 'some data')
const msg = computed(() => result.value?.msg)
```

## Type Declarations

```ts
/**
 * Returns Promise<any> - Resolves with the response from the main process.
 *
 * Send a message to the main process via channel and expect a result ~~asynchronously~~. As composition-api, it makes asynchronous operations look like synchronous.
 *
 * You need to provide `ipcRenderer` to this function.
 *
 * @see https://www.electronjs.org/docs/api/ipc-renderer#ipcrendererinvokechannel-args
 * @see https://vueuse.org/useIpcRendererInvoke
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useIpcRendererInvoke<T>(
  ipcRenderer: IpcRenderer,
  channel: string,
  ...args: any[]
): ShallowRef<T | null>
/**
 * Returns Promise<any> - Resolves with the response from the main process.
 *
 * Send a message to the main process via channel and expect a result ~~asynchronously~~. As composition-api, it makes asynchronous operations look like synchronous.
 *
 * `ipcRenderer` will be automatically gotten.
 *
 * @see https://www.electronjs.org/docs/api/ipc-renderer#ipcrendererinvokechannel-args
 * @see https://vueuse.org/useIpcRendererInvoke
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useIpcRendererInvoke<T>(
  channel: string,
  ...args: any[]
): ShallowRef<T | null>
```
