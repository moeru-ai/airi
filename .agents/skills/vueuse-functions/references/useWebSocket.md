---
category: Network
---

# useWebSocket

Reactive [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket) client.

## Usage

```ts
import { useWebSocket } from '@vueuse/core'

const { status, data, send, open, close, ws } = useWebSocket('ws://websocketurl')
```

### Return Values

| Property | Type                                      | Description                          |
| -------- | ----------------------------------------- | ------------------------------------ |
| `data`   | `Ref<any>`                                | Latest received data                 |
| `status` | `Ref<'OPEN' \| 'CONNECTING' \| 'CLOSED'>` | Connection status                    |
| `ws`     | `Ref<WebSocket>`                          | WebSocket instance                   |
| `send`   | `(data, useBuffer?) => boolean`           | Send data (buffers if not connected) |
| `open`   | `() => void`                              | Open/reconnect the connection        |
| `close`  | `(code?, reason?) => void`                | Close the connection                 |

### Callbacks

```ts
const { data } = useWebSocket('ws://websocketurl', {
  onConnected(ws) {
    console.log('Connected!')
  },
  onDisconnected(ws, event) {
    console.log('Disconnected!', event.code)
  },
  onError(ws, event) {
    console.error('Error:', event)
  },
  onMessage(ws, event) {
    console.log('Message:', event.data)
  },
})
```

See the [Type Declarations](#type-declarations) for more options.

### immediate

Enable by default.

Establish the connection immediately when the composable is called.

### autoConnect

Enable by default.

If a URL is provided as a ref, when the URL changes, it will automatically reconnect to the new URL.

### autoClose

Enable by default.

This will call `close()` automatically when the `beforeunload` event is triggered or the associated effect scope is stopped.

### autoReconnect

Reconnect on errors automatically (disabled by default).

```ts
import { useWebSocket } from '@vueuse/core'
// ---cut---
const { status, data, close } = useWebSocket('ws://websocketurl', {
  autoReconnect: true,
})
```

Or with more controls over its behavior:

```ts
import { useWebSocket } from '@vueuse/core'
// ---cut---
const { status, data, close } = useWebSocket('ws://websocketurl', {
  autoReconnect: {
    retries: 3,
    delay: 1000,
    onFailed() {
      alert('Failed to connect WebSocket after 3 retries')
    },
  },
})
```

You can also pass a function to `delay` to calculate the delay based on the number of retries. This is useful for implementing exponential backoff:

```ts
import { useWebSocket } from '@vueuse/core'
// ---cut---
const { status, data, close } = useWebSocket('ws://websocketurl', {
  autoReconnect: {
    retries: 5,
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    delay: retries => Math.min(1000 * 2 ** (retries - 1), 30000),
  },
})
```

```ts
import { useWebSocket } from '@vueuse/core'
// ---cut---
const { status, data, close } = useWebSocket('ws://websocketurl', {
  autoReconnect: {
    retries: 5,
    // Linear backoff: 1s, 2s, 3s, 4s, 5s
    delay: retries => retries * 1000,
  },
})
```

Explicitly calling `close()` won't trigger the auto reconnection.

### heartbeat

It's common practice to send a small message (heartbeat) for every given time passed to keep the connection active. In this function we provide a convenient helper to do it:

```ts
import { useWebSocket } from '@vueuse/core'
// ---cut---
const { status, data, close } = useWebSocket('ws://websocketurl', {
  heartbeat: true,
})
```

Or with more controls:

```ts
import { useWebSocket } from '@vueuse/core'
// ---cut---
const { status, data, close } = useWebSocket('ws://websocketurl', {
  heartbeat: {
    message: 'ping',
    scheduler: cb => useIntervalFn(cb, 2000),
    pongTimeout: 1000,
  },
})
```

### Sub-protocols

List of one or more subprotocols to use, in this case SOAP and WAMP.

```ts
import { useWebSocket } from '@vueuse/core'
// ---cut---
const { status, data, send, open, close } = useWebSocket('ws://websocketurl', {
  protocols: ['soap'], // ['soap', 'wamp']
})
```

## Type Declarations

```ts
export type WebSocketStatus = "OPEN" | "CONNECTING" | "CLOSED"
export type WebSocketHeartbeatMessage = string | ArrayBuffer | Blob
export interface UseWebSocketOptions {
  onConnected?: (ws: WebSocket) => void
  onDisconnected?: (ws: WebSocket, event: CloseEvent) => void
  onError?: (ws: WebSocket, event: Event) => void
  onMessage?: (ws: WebSocket, event: MessageEvent) => void
  /**
   * Send heartbeat for every x milliseconds passed
   *
   * @default false
   */
  heartbeat?:
    | boolean
    | (ConfigurableScheduler & {
        /**
         * Message for the heartbeat
         *
         * @default 'ping'
         */
        message?: MaybeRefOrGetter<WebSocketHeartbeatMessage>
        /**
         * Response message for the heartbeat, if undefined the message will be used
         */
        responseMessage?: MaybeRefOrGetter<WebSocketHeartbeatMessage>
        /**
         * Interval, in milliseconds
         *
         * @deprecated Please use `scheduler` option instead
         * @default 1000
         */
        interval?: number
        /**
         * Heartbeat response timeout, in milliseconds
         *
         * @default 1000
         */
        pongTimeout?: number
      })
  /**
   * Enabled auto reconnect
   *
   * @default false
   */
  autoReconnect?:
    | boolean
    | {
        /**
         * Maximum retry times.
         *
         * Or you can pass a predicate function (which returns true if you want to retry).
         *
         * @default -1
         */
        retries?: number | ((retried: number) => boolean)
        /**
         * Delay for reconnect, in milliseconds
         *
         * Or you can pass a function to calculate the delay based on the number of retries.
         *
         * @default 1000
         */
        delay?: number | ((retries: number) => number)
        /**
         * On maximum retry times reached.
         */
        onFailed?: Fn
      }
  /**
   * Immediately open the connection when calling this composable
   *
   * @default true
   */
  immediate?: boolean
  /**
   * Automatically connect to the websocket when URL changes
   *
   * @default true
   */
  autoConnect?: boolean
  /**
   * Automatically close a connection
   *
   * @default true
   */
  autoClose?: boolean
  /**
   * List of one or more sub-protocol strings
   *
   * @default []
   */
  protocols?: string[]
}
export interface UseWebSocketReturn<T> {
  /**
   * Reference to the latest data received via the websocket,
   * can be watched to respond to incoming messages
   */
  data: ShallowRef<T | null>
  /**
   * The current websocket status, can be only one of:
   * 'OPEN', 'CONNECTING', 'CLOSED'
   */
  status: ShallowRef<WebSocketStatus>
  /**
   * Closes the websocket connection gracefully.
   */
  close: WebSocket["close"]
  /**
   * Reopen the websocket connection.
   * If there the current one is active, will close it before opening a new one.
   */
  open: Fn
  /**
   * Sends data through the websocket connection.
   *
   * @param data
   * @param useBuffer when the socket is not yet open, store the data into the buffer and sent them one connected. Default to true.
   */
  send: (data: string | ArrayBuffer | Blob, useBuffer?: boolean) => boolean
  /**
   * Reference to the WebSocket instance.
   */
  ws: ShallowRef<WebSocket | undefined>
}
/**
 * Reactive WebSocket client.
 *
 * @see https://vueuse.org/useWebSocket
 * @param url
 */
export declare function useWebSocket<Data = any>(
  url: MaybeRefOrGetter<string | URL | undefined>,
  options?: UseWebSocketOptions,
): UseWebSocketReturn<Data>
```
