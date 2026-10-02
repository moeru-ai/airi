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
`context:update.ttlMs` sets an observation lifetime. `salience` affects retention and cannot grant permissions.
`sourceRef` identifies module-owned details through a query namespace and lookup key. It does not grant access or tool authority.
`context:source:request` asks the writer of a visible observation for those details. The writer answers with `context:source:response`, routed to the request's `originConnectionId`.
Both events need explicit route destinations. The server never broadcasts them.
`module:authenticated.connectionId` tells a peer its own server connection. It changes on every reconnection.
The `connection` route expression matches exact server connection IDs. It does not match module names, client aliases, or wildcard patterns.
`extension:module:announce` can carry a `cognition` declaration. `scenes` lists binding prefixes that the module serves, inside its own `<name>:` namespace.
A module with scenes can send input only with a matching binding. It can never name a session. A module without scenes speaks for the owner.
`registry:modules:sync` lists each module with its `connectionId` and `cognition`. Only the server sends it.
`speech:device` lets a module offer or withdraw a speech device for one of its declared scenes, for example a Discord voice channel.
`speech:audio` carries one encoded speech segment to a device, and `speech:stop` stops it. Both need explicit route destinations.
`spark:notify.coalesceKey` lets a newer notification replace waiting ones from the same source. Use it only for state whose older version has no remaining meaning.

- You need canonical protocol contracts for plugin <-> host communication.
- You need event name stability and matching payload definitions across runtimes.

## When not to use

- You only need higher-level runtime client APIs from SDK packages.
- You are implementing app-only UI state that is not part of plugin/server transport contracts.

## License

[MIT](../../LICENSE)
