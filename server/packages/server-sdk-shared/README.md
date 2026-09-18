# @proj-airi/server-sdk-shared

Shared contracts for the hosted API and chat WebSocket.

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

## Flux history

Import the HTTP response types from the dedicated Flux entrypoint:

```typescript
import type { FluxHistoryEntry, FluxHistoryPage } from '@proj-airi/server-sdk-shared/flux'
```

The hosted API and Flux settings page use this contract. TTS debits are combined
by turn before pagination. Use `packages/server-shared` for Server Channel events,
not hosted API contracts.

## License

[MIT](../../../LICENSE)
