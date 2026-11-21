# @proj-airi/server-sdk-shared

Eventa and HTTP contracts for the hosted chat and realtime endpoints.

## Usage

```shell
ni @proj-airi/server-sdk-shared -D
pnpm i @proj-airi/server-sdk-shared -D
```

```typescript
import type { WireMessage } from '@proj-airi/server-sdk-shared'

import { newMessages, pullMessages, sendMessages } from '@proj-airi/server-sdk-shared'
```

The package uses Eventa `1.0.0-beta.15`. Its WebSocket adapter accepts beta.13
`id/type/payload` envelopes and sends these fields with current envelopes.

`/ws/chat` keeps query-token authentication for deployed clients. `/ws/v2/chat`
authenticates after the WebSocket opens with `chat:authenticate`.

## Realtime

```typescript
import { authenticate, parseCallAccess, RELAY_EVENT_PREFIX, RELAY_MAX_FRAME_BYTES } from '@proj-airi/server-sdk-shared/realtime'
```

`/ws/v1/realtime` authenticates with `realtime:authenticate` after the WebSocket opens. It then forwards each frame
with an event id under `RELAY_EVENT_PREFIX` to the other devices of the account. The device contracts are in
`@proj-airi/realtime-protocol`.

`POST /api/v1/realtime/calls/:callId/access` returns a `CallAccess`.

## License

[MIT](../../../LICENSE)
