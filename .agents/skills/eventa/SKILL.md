---
name: eventa
description: >-
  Guide for using @moeru/eventa — a transport-aware event library powering ergonomic RPC
  and streaming flows. Use this skill whenever the user imports from '@moeru/eventa',
  mentions eventa, needs cross-process/cross-thread event communication (Electron IPC,
  Web Workers, WebSocket, BroadcastChannel, EventEmitter, EventTarget, Worker Threads),
  wants to define type-safe events with RPC invoke patterns, needs streaming RPC
  (server-streaming, client-streaming, or bidirectional), or asks about transport-agnostic
  event abstractions. Also use when the user discusses alternatives to birpc or async-call-rpc.
license: MIT
metadata:
  author: moeru-ai
  version: "1.0.0"
---

# @moeru/eventa

Transport-aware events powering ergonomic RPC and streaming flows.

## Core Concepts

Eventa is built around three ideas:

1. **Events are first-class** — define typed events once, use them everywhere
2. **Transports are swappable** — the same event definitions work across Electron IPC, WebSocket, Web Workers, BroadcastChannel, EventEmitter, EventTarget, and Worker Threads
3. **RPC is just events** — invoke/stream patterns are composed from the same event primitives

## API Quick Reference

### Event Definition & Context

```ts
import { createContext, defineEventa } from '@moeru/eventa'

// Define a typed event (the generic is the payload type)
const move = defineEventa<{ x: number, y: number }>()

// Create a base context (in-memory, useful for same-process communication)
const ctx = createContext()

// Emit and listen
ctx.emit(move, { x: 100, y: 200 })
ctx.on(move, ({ body }) => console.log(body.x, body.y))
```

### Unary RPC (Invoke)

```ts
import { createContext, defineInvoke, defineInvokeEventa, defineInvokeHandler } from '@moeru/eventa'

const ctx = createContext()

// defineInvokeEventa<ResponseType, RequestType>(optionalName)
const echo = defineInvokeEventa<{ output: string }, { input: string }>('rpc:echo')

// Register handler (server side)
defineInvokeHandler(ctx, echo, ({ input }) => ({ output: input.toUpperCase() }))

// Create invoke function (client side)
const invokeEcho = defineInvoke(ctx, echo)
const result = await invokeEcho({ input: 'hello' }) // { output: 'HELLO' }
```

### Streaming RPC (Server-Streaming)

```ts
import { createContext, defineInvokeEventa, defineStreamInvoke, defineStreamInvokeHandler, toStreamHandler } from '@moeru/eventa'

const ctx = createContext()
const sync = defineInvokeEventa<
  { type: 'progress' | 'result', value: number },
  { jobId: string }
>('rpc:sync')

// Generator-style handler
defineStreamInvokeHandler(ctx, sync, async function* ({ jobId }) {
  for (let i = 1; i <= 5; i++) {
    yield { type: 'progress' as const, value: i * 20 }
  }
  yield { type: 'result' as const, value: 100 }
})

// Or imperative style with toStreamHandler
defineStreamInvokeHandler(ctx, sync, toStreamHandler(async ({ payload, emit }) => {
  emit({ type: 'progress', value: 0 })
  emit({ type: 'result', value: 100 })
}))

// Consume as async iterator
const stream = defineStreamInvoke(ctx, sync)
for await (const update of stream({ jobId: 'import' })) {
  console.log(update.type, update.value)
}
```

### Client-Streaming (Stream Input, Unary Output)

```ts
const recordRoute = defineInvokeEventa<
  { distance: number, points: number },
  ReadableStream<{ lat: number, lng: number }>
>('rpc:record-route')

defineInvokeHandler(ctx, recordRoute, async (stream) => {
  let points = 0
  for await (const _ of stream) points += 1
  return { distance: points * 10, points }
})

const invoke = defineInvoke(ctx, recordRoute)
const input = new ReadableStream({
  start(c) { c.enqueue({ lat: 0, lng: 0 }); c.enqueue({ lat: 1, lng: 1 }); c.close() },
})
await invoke(input)
```

### Bidirectional Streaming

```ts
const routeChat = defineInvokeEventa<
  { message: string },
  ReadableStream<{ message: string }>
>('rpc:route-chat')

defineStreamInvokeHandler(ctx, routeChat, async function* (incoming) {
  for await (const note of incoming) {
    yield { message: `echo: ${note.message}` }
  }
})

const stream = defineStreamInvoke(ctx, routeChat)
for await (const note of stream(outgoing)) {
  console.log(note.message)
}
```

### Abort/Cancel

```ts
// Client-side cancellation
const controller = new AbortController()
const promise = invokeMethod({ input: 'work' }, { signal: controller.signal })
controller.abort('user cancelled')

// Server-side abort awareness
defineInvokeHandler(ctx, event, async ({ input }, options) => {
  const signal = options?.abortController?.signal
  if (signal?.aborted) return { output: 'aborted' }
  signal?.addEventListener('abort', () => { /* cleanup */ }, { once: true })
  return { output: `done: ${input}` }
})
```

### Multi-hop Channels

Channels form ordered routing chains. They carry events, unary invokes, every
stream frame, and invocation cancellation through intermediate contexts.

```ts
import { linkChannel, pipeChannel } from '@moeru/eventa'

pipeChannel(a, b, c) // a -> b -> c
linkChannel(a, b, c) // a <-> b <-> c
```

There is no direct `a` to `c` edge. Use multiple explicit pipes for fan-out.
Disposing a channel removes its edges only; context abort never cascades across
a link. One connected graph must have one effective handler for each invoke
definition.

Each local emit creates an `EventaInner` whose `deliveryId` survives channel
hops and transport serialization. Contexts suppress recently seen delivery IDs
and stop forwarding when `hopsRemaining` reaches zero. Plugins may inspect the
read-only inner value and transform or drop its Eventa, but may not replace routing
identity or hop state.

For iframe-to-server routing, connect the EventTarget-side context to the
plugin's BroadcastChannel context, then connect the gateway's BroadcastChannel
context to its WebSocket context. The adapters carry the inner value across the
runtime boundaries; no directional forwarding markers are needed.

Contexts do not serialize concurrent `emit()` calls. Request and response
stream pumps await each frame only to preserve per-invocation stream order;
cancellation is routed independently and may arrive before request frames.

### Bulk Registration (Shorthands)

```ts
const events = {
  double: defineInvokeEventa<number, number>(),
  append: defineInvokeEventa<string, string>(),
}

defineInvokeHandlers(ctx, events, {
  double: input => input * 2,
  append: input => `${input}!`,
})

const { double, append } = defineInvokes(ctx, events)
```

## Adapters

Each adapter wraps a specific transport into an eventa context. The pattern is always:

```ts
import { createContext } from '@moeru/eventa/adapters/<adapter-name>'
const { context } = createContext(transportInstance)
```

### Available Adapters

| Adapter | Import Path | Transport |
|---------|-------------|-----------|
| Electron Main | `@moeru/eventa/adapters/electron/main` | `ipcMain` + `webContents` |
| Electron Renderer | `@moeru/eventa/adapters/electron/renderer` | `ipcRenderer` |
| Web Worker (main) | `@moeru/eventa/adapters/webworkers` | `Worker` instance |
| Web Worker (worker) | `@moeru/eventa/adapters/webworkers/worker` | `self` (worker global) |
| Worker Threads (main) | `@moeru/eventa/adapters/worker-threads` | Node.js `Worker` |
| Worker Threads (worker) | `@moeru/eventa/adapters/worker-threads/worker` | `parentPort` |
| WebSocket Client | `@moeru/eventa/adapters/websocket/native` | `WebSocket` |
| WebSocket Server (H3) | `@moeru/eventa/adapters/websocket/h3` | H3 WebSocket hooks |
| BroadcastChannel | `@moeru/eventa/adapters/broadcast-channel` | `BroadcastChannel` |
| EventTarget | `@moeru/eventa/adapters/event-target` | `EventTarget` |
| EventEmitter | `@moeru/eventa/adapters/event-emitter` | Node.js `EventEmitter` |

### Adapter Usage Pattern (Electron Example)

```ts
// shared/events.ts — define events once
import { defineInvokeEventa } from '@moeru/eventa'
export const readdir = defineInvokeEventa<{ dirs: string[] }, { path: string }>('fs:readdir')

// main.ts — register handler
import { createContext } from '@moeru/eventa/adapters/electron/main'
const { context } = createContext(ipcMain, mainWindow.webContents)
defineInvokeHandler(context, readdir, async ({ path }) => ({ dirs: await fs.readdir(path) }))

// renderer.ts (preload) — call it
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
const { context } = createContext(ipcRenderer)
const invokeReaddir = defineInvoke(context, readdir)
const result = await invokeReaddir({ path: '/usr' })
```

## Advanced Features

- **Delivery routing**: `EventaInner<T>` preserves delivery identity and hop budget across channels and adapters
- **Match expressions**: `matchBy(glob)`, `matchBy(regex)`, `and(...)`, `or(...)` for event filtering
- **WebSocket lifecycle**: `wsConnectedEvent` and `wsDisconnectedEvent` from the native adapter

## Key Rules

1. Always define events in a shared module — both sides import the same event definition for type safety
2. `defineInvokeEventa<Res, Req>()` — Response type comes first, Request type second
3. Handlers can throw errors safely — eventa propagates them to the caller
4. Validate data at the edges — eventa forwards whatever payload you emit
5. Install only the peer dependencies you need (electron, h3, web-worker are all optional)

## Documentation

For the latest API reference, use context7 to query `@moeru/eventa` documentation.
