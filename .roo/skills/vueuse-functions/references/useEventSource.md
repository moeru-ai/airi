---
category: Network
---

# useEventSource

An [EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) or [Server-Sent-Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) instance opens a persistent connection to an HTTP server, which sends events in text/event-stream format.

## Usage

```ts
import { useEventSource } from '@vueuse/core'

const { status, data, error, close } = useEventSource('https://event-source-url')
```

See the [Type Declarations](#type-declarations) for more options.

### Named Events

You can define named events with the second parameter

```ts
import { useEventSource } from '@vueuse/core'
// ---cut---
const { event, data } = useEventSource(
  'https://event-source-url',
  ['notice', 'update']
)
```

### immediate

Enable by default.

Establish the connection immediately when the composable is called.

### autoConnect

Enable by default.

If url is provided as a ref, when the url changes, it will automatically reconnect to the new url.

### Auto Reconnection on Errors

Reconnect on errors automatically (disabled by default).

```ts
import { useEventSource } from '@vueuse/core'
// ---cut---
const { status, data, close } = useEventSource(
  'https://event-source-url',
  [],
  {
    autoReconnect: true,
  }
)
```

Or with more controls over its behavior:

```ts
import { useEventSource } from '@vueuse/core'
// ---cut---
const { status, data, close } = useEventSource(
  'https://event-source-url',
  [],
  {
    autoReconnect: {
      retries: 3,
      delay: 1000,
      onFailed() {
        alert('Failed to connect EventSource after 3 retries')
      },
    },
  }
)
```

### Data Serialization

Apply custom transformations to incoming data using a serialization function.

```ts
import { useEventSource } from '@vueuse/core'
// ---cut---
const { data } = useEventSource(
  'https://event-source-url',
  [],
  {
    serializer: {
      read: rawData => JSON.parse(rawData),
    },
  }
)

// If server sends: '{"name":"John","age":30}'
// data.value will be: { name: 'John', age: 30 }
```

## Type Declarations

```ts
export type EventSourceStatus = 'CONNECTING' | 'OPEN' | 'CLOSED'
export interface UseEventSourceOptions<Data> extends EventSourceInit {
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
      retries?: number | (() => boolean)
      /**
       * Delay for reconnect, in milliseconds
       *
       * @default 1000
       */
      delay?: number
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
   * Custom data serialization
   */
  serializer?: {
    read: (v?: string) => Data
  }
}
export interface UseEventSourceReturn<Events extends string[], Data = any> {
  /**
   * Reference to the latest data received via the EventSource,
   * can be watched to respond to incoming messages
   */
  data: ShallowRef<Data | null>
  /**
   * The current state of the connection, can be only one of:
   * 'CONNECTING', 'OPEN' 'CLOSED'
   */
  status: ShallowRef<EventSourceStatus>
  /**
   * The latest named event
   */
  event: ShallowRef<Events[number] | null>
  /**
   * The current error
   */
  error: ShallowRef<Event | null>
  /**
   * Closes the EventSource connection gracefully.
   */
  close: EventSource['close']
  /**
   * Reopen the EventSource connection.
   * If there the current one is active, will close it before opening a new one.
   */
  open: Fn
  /**
   * Reference to the current EventSource instance.
   */
  eventSource: Ref<EventSource | null>
  /**
   * The last event ID string, for server-sent events.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/MessageEvent/lastEventId
   */
  lastEventId: ShallowRef<string | null>
}
/**
 * Reactive wrapper for EventSource.
 *
 * @see https://vueuse.org/useEventSource
 * @see https://developer.mozilla.org/en-US/docs/Web/API/EventSource/EventSource EventSource
 * @param url
 * @param events
 * @param options
 */
export declare function useEventSource<Events extends string[], Data = any>(
  url: MaybeRefOrGetter<string | URL | undefined>,
  events?: Events,
  options?: UseEventSourceOptions<Data>,
): UseEventSourceReturn<Events, Data>
```
