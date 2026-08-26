# @proj-airi/better-ws

Runtime-agnostic WebSocket primitives for reliable realtime connections.

## What it does

- Provides `createClient(...)` and `createServer(...)` runtime primitives.
- Tracks client connection state and schedules reconnects after unexpected closes.
- Tracks server peers and supports peer send, broadcast, and named groups.
- Dispatches raw caller-owned messages without imposing an event, RPC, or extension protocol.

## How to use

```ts
import { createClient } from '@proj-airi/better-ws'
import { createServer } from '@proj-airi/better-ws/server'

const client = createClient({
  url: 'ws://localhost:3000/ws',
  // Reconnect is enabled by default; pass an object to customize the policy.
  reconnect: {
    retries: Number.POSITIVE_INFINITY,
    delay: attempt => Math.min(1000 * 2 ** (attempt - 1), 30_000),
  },
})

await client.connect()
client.send('hello')

const server = createServer<string>()

server.onMessage(({ server, message }) => {
  server.broadcast(message)
})

const peer = server.accept({
  id: 'peer-1',
  send(message) {
    console.info('send to runtime', message)
    return true
  },
})

peer.receive('hello')
```

Server peer liveness is opt-in and scheduler-driven. It tracks inbound traffic
without imposing any protocol event shape. `checkLiveness()` evaluates
`peers.unhealthyTimeout` and `peers.closeTimeout`; server-side heartbeat
`mode`, `interval`, `message`, and `isResponse` are reserved for app or
adapter driven scheduling and do not automatically send pings or classify
responses.

```ts
const server = createServer<string>({
  peers: {
    unhealthyTimeout: 60_000,
    closeTimeout: 120_000,
  },
  heartbeat: {
    timeout: 60_000,
  },
})

server.onPeerHealthChange(({ peer, healthy, silentFor }) => {
  console.info('peer health changed', peer.id, healthy, silentFor)
})

setInterval(() => {
  server.checkLiveness()
}, 30_000)
```

Heartbeat is opt-in. This example uses an application-level message heartbeat.
Message heartbeat mode requires `message` so the client knows what to send:

```ts
const client = createClient({
  url: 'ws://localhost:3000/ws',
  heartbeat: {
    mode: 'message',
    message: 'ping',
    isResponse: message => message === 'pong',
    interval: 30_000,
    timeout: 10_000,
  },
})
```

Native ping heartbeat is used only when a connector exposes `ping()`. In `auto`
mode, the client uses native `ping()` when available and falls back to message
heartbeat only when `message` is provided. The built-in browser `WebSocket`
adapter does not expose native ping frames.

When `isResponse` is provided, heartbeat uses strict response matching: only a
matching inbound message clears the pending heartbeat timeout. When `isResponse`
is omitted, any inbound message is treated as liveness and clears the pending
timeout.

For non-text messages or non-native runtimes, pass a connector. The connector owns parsing and serialization:

```ts
const client = createClient<string>({
  connector: {
    async connect(events) {
      const ws = new WebSocket('ws://localhost:3000/ws')
      ws.addEventListener('message', event => events.message(String(event.data)))
      ws.addEventListener('close', event => events.close({ code: event.code, reason: event.reason, wasClean: event.wasClean }))
      ws.addEventListener('error', event => events.error(event))

      await new Promise<void>((resolve) => {
        ws.addEventListener('open', () => resolve(), { once: true })
      })

      return {
        send: next => ws.send(next),
        close: (code, reason) => ws.close(code, reason),
      }
    },
  },
})

await client.connect()
client.send('hello')
```

## When to use

- You need connection lifecycle, peer registry, reconnect, and broadcast primitives.
- You want to keep message shape controlled by the application or a higher-level adapter.
- You are building an Eventa, JSON-RPC, extension, or custom protocol adapter on top.

## When not to use

- You need a full application protocol out of the box.
- You want Socket.IO-compatible clients or packet formats.
- You only need one direct native `WebSocket` without reconnect or peer management.

## License

[MIT](../../LICENSE)
