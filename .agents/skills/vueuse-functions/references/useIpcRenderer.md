---
category: '@Electron'
---

# useIpcRenderer

Provides [ipcRenderer](https://www.electronjs.org/docs/api/ipc-renderer) and all of its APIs with Vue reactivity.

## Usage

```ts
import { useIpcRenderer } from '@vueuse/electron'
import { computed } from 'vue'

// enable nodeIntegration if you don't provide ipcRenderer explicitly
// see: https://www.electronjs.org/docs/api/webview-tag#nodeintegration
const ipcRenderer = useIpcRenderer()

// Ref result will return
const result = ipcRenderer.invoke<string>('custom-channel', 'some data')
const msg = computed(() => result.value?.msg)

// remove listener automatically on unmounted
ipcRenderer.on('custom-event', (event, ...args) => {
  console.log(args)
})
```

### Available Methods

| Method                                     | Description                                          |
| ------------------------------------------ | ---------------------------------------------------- |
| `on(channel, listener)`                    | Listen to channel. Auto-removes listener on unmount. |
| `once(channel, listener)`                  | Listen to channel once                               |
| `removeListener(channel, listener)`        | Remove specific listener                             |
| `removeAllListeners(channel)`              | Remove all listeners for channel                     |
| `send(channel, ...args)`                   | Send async message to main process                   |
| `invoke(channel, ...args)`                 | Send message and get response as `ShallowRef`        |
| `sendSync(channel, ...args)`               | Send sync message and get response as `ShallowRef`   |
| `postMessage(channel, message, transfer?)` | Send message with transferable objects               |
| `sendTo(webContentsId, channel, ...args)`  | Send to specific webContents                         |
| `sendToHost(channel, ...args)`             | Send to webview host                                 |

### With Custom IpcRenderer

If `nodeIntegration` is disabled, you can pass the `ipcRenderer` instance explicitly:

```ts
import { useIpcRenderer } from '@vueuse/electron'
import { ipcRenderer } from 'electron'

const ipc = useIpcRenderer(ipcRenderer)
```

## Type Declarations

```ts
/**
 * Result from useIpcRenderer
 *
 * @see https://www.electronjs.org/docs/api/ipc-renderer
 */
export interface UseIpcRendererReturn {
  /**
   * Listens to channel, when a new message arrives listener would be called with listener(event, args...).
   * [ipcRenderer.removeListener](https://www.electronjs.org/docs/api/ipc-renderer#ipcrendererremovelistenerchannel-listener) automatically on unmounted.
   *
   * @see https://www.electronjs.org/docs/api/ipc-renderer#ipcrendereronchannel-listener
   */
  on: (channel: string, listener: IpcRendererListener) => IpcRenderer
  /**
   * Adds a one time listener function for the event. This listener is invoked only the next time a message is sent to channel, after which it is removed.
   *
   * @see https://www.electronjs.org/docs/api/ipc-renderer#ipcrendereroncechannel-listener
   */
  once: (
    channel: string,
    listener: (event: IpcRendererEvent, ...args: any[]) => void,
  ) => IpcRenderer
  /**
   * Removes the specified listener from the listener array for the specified channel.
   *
   * @see https://www.electronjs.org/docs/api/ipc-renderer#ipcrendererremovelistenerchannel-listener
   */
  removeListener: (
    channel: string,
    listener: (...args: any[]) => void,
  ) => IpcRenderer
  /**
   * Removes all listeners, or those of the specified channel.
   *
   * @see https://www.electronjs.org/docs/api/ipc-renderer#ipcrendererremovealllistenerschannel
   */
  removeAllListeners: (channel: string) => IpcRenderer
  /**
   * Send an asynchronous message to the main process via channel, along with arguments.
   *
   * @see https://www.electronjs.org/docs/api/ipc-renderer#ipcrenderersendchannel-args
   */
  send: (channel: string, ...args: any[]) => void
  /**
   * Returns Promise<any> - Resolves with the response from the main process.
   * Send a message to the main process via channel and expect a result ~~asynchronously~~.
   * As composition-api, it makes asynchronous operations look like synchronous.
   *
   * @see https://www.electronjs.org/docs/api/ipc-renderer#ipcrendererinvokechannel-args
   */
  invoke: <T>(channel: string, ...args: any[]) => ShallowRef<T | null>
  /**
   * Returns any - The value sent back by the ipcMain handler.
   * Send a message to the main process via channel and expect a result synchronously.
   *
   * @see https://www.electronjs.org/docs/api/ipc-renderer#ipcrenderersendsyncchannel-args
   */
  sendSync: <T>(channel: string, ...args: any[]) => ShallowRef<T | null>
  /**
   * Send a message to the main process, optionally transferring ownership of zero or more MessagePort objects.
   *
   * @see https://www.electronjs.org/docs/api/ipc-renderer#ipcrendererpostmessagechannel-message-transfer
   */
  postMessage: (channel: string, message: any, transfer?: MessagePort[]) => void
  /**
   * Sends a message to a window with webContentsId via channel.
   *
   * @see https://www.electronjs.org/docs/api/ipc-renderer#ipcrenderersendtowebcontentsid-channel-args
   */
  sendTo: (webContentsId: number, channel: string, ...args: any[]) => void
  /**
   * Like ipcRenderer.send but the event will be sent to the <webview> element in the host page instead of the main process.
   *
   * @see https://www.electronjs.org/docs/api/ipc-renderer#ipcrenderersendtohostchannel-args
   */
  sendToHost: (channel: string, ...args: any[]) => void
}
/**
 * Get the `ipcRenderer` module with all APIs.
 *
 * @see https://www.electronjs.org/docs/api/ipc-renderer#ipcrenderersendtohostchannel-args
 * @see https://vueuse.org/useIpcRenderer
 */
export declare function useIpcRenderer(
  ipcRenderer?: IpcRenderer,
): UseIpcRendererReturn
```
