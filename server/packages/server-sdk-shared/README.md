# @proj-airi/server-sdk-shared

Eventa contracts for the hosted chat WebSocket.

## Usage

```shell
ni @proj-airi/server-sdk-shared -D
pnpm i @proj-airi/server-sdk-shared -D
```

```typescript
import type { WireMessage } from '@proj-airi/server-sdk-shared'

import { deleteMessages, newMessages, pullMessages, sendMessages } from '@proj-airi/server-sdk-shared'
```

`deleteMessages` soft-deletes messages. `pullMessages` and `newMessages` then
return each deleted message as a tombstone: a `WireMessage` with `deletedAt`,
empty `content`, and the `seq` of the deletion.

The package uses Eventa `1.0.0-beta.15`. Its WebSocket adapter accepts beta.13
`id/type/payload` envelopes and sends these fields with current envelopes.

`/ws/chat` keeps query-token authentication for deployed clients. `/ws/v2/chat`
authenticates after the WebSocket opens with `chat:authenticate`.

## License

[MIT](../../../LICENSE)
