# @proj-airi/plugin-protocol

Shared protocol contracts for plugin-module communication in Project AIRI.

## What it does

- Defines websocket event names and payload types for module/plugin orchestration.
- Exposes Eventa event definitions bound to protocol event names.
- Provides shared transport/event utility types used by server and plugin runtimes.

## How to use

```ts
import type { WebSocketEvent, WebSocketEventOf, WebSocketEvents } from '@proj-airi/plugin-protocol/types'

import { moduleAnnounce, moduleAuthenticate } from '@proj-airi/plugin-protocol/types'
```

## When to use

- You need canonical protocol contracts for plugin <-> host communication.
- You need event name stability and matching payload definitions across runtimes.

## When not to use

- You only need higher-level runtime client APIs from SDK packages.
- You are implementing app-only UI state that is not part of plugin/server transport contracts.

## License

[MIT](../../LICENSE)
