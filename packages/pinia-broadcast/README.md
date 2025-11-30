# @proj-airi/pinia-broadcast

Pinia plugin that keeps store state in sync across multiple renderer windows/contexts. It uses `BroadcastChannel` by default and can fall back to a lightweight `SharedWorker` relay when channels are unavailable or when you want a single bus shared by many windows.

## Install

```bash
pnpm add -D @proj-airi/pinia-broadcast
```

## Usage

```ts
import { createBroadcastPlugin } from '@proj-airi/pinia-broadcast'
// pinia.ts
import { createPinia } from 'pinia'

const pinia = createPinia()

pinia.use(createBroadcastPlugin({
  channel: 'airi-pinia', // optional; defaults to airi-pinia-broadcast
  // preferSharedWorker: true, // use SharedWorker relay even if BroadcastChannel exists
  // includeStore: ({ store }) => store.$id.startsWith('chat-'), // opt-in only certain stores
}))

export default pinia
```

### How it works

- Each store publishes state changes through a transport (BroadcastChannel by default).
- Remote updates are applied with `$patch`, guarded with an instance id to prevent echo loops.
- An inline SharedWorker relay is available for environments where BroadcastChannel is missing or when you want one bus across many Electron windows.

### Options

- `channel`: name for the BroadcastChannel/SharedWorker (default: `airi-pinia-broadcast`).
- `preferSharedWorker`: force the SharedWorker relay even when BroadcastChannel exists.
- `sharedWorkerName`: override the SharedWorker name (defaults to `channel`).
- `transport`: provide a custom transport (`broadcast`, `subscribe`, `close?`) if you need to integrate with another bus.
- `includeStore`: `(context) => boolean` predicate to decide which stores sync.
- `serialize` / `deserialize`: customize how state is sent/applied.
- `syncInitialState`: when `true` (default) send the initial state once on store creation.

### Custom transport

If you already have a cross-window bus, supply it directly:

```ts
import { createBroadcastPlugin, createSharedWorkerTransport } from '@proj-airi/pinia-broadcast'

pinia.use(createBroadcastPlugin({
  transport: createSharedWorkerTransport('airi-pinia'),
}))
```
