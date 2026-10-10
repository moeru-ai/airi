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

`input:text` can carry `overrides.binding` for an external scene. The host resolves that binding to a persistent persona session.
`overrides.sessionId` identifies an existing host session. A binding takes precedence when both fields are present.
The `connection` route expression matches exact server connection IDs. It does not match module names, client aliases, or wildcard patterns.
`extension:module:announce` can carry a `cognition` declaration. `scenes` lists binding prefixes that the module serves, inside its own `<name>:` namespace.
A module with scenes can send input only with a matching binding. It can never name a session. A module without scenes speaks for the owner.
`registry:modules:sync` lists each module with its `connectionId` and `cognition`. Only the server sends it.

- You need canonical protocol contracts for plugin <-> host communication.
- You need event name stability and matching payload definitions across runtimes.

## When not to use

- You only need higher-level runtime client APIs from SDK packages.
- You are implementing app-only UI state that is not part of plugin/server transport contracts.

## License

[MIT](../../LICENSE)
