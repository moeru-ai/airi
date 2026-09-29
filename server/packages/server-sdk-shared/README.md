# @proj-airi/server-sdk-shared

Eventa contracts for the hosted chat WebSocket.

The `/contacts` export provides Valibot contracts for private character and contact
sync. `CharacterDocumentSchema` admits portable persona fields and model selections.
It rejects credentials, arbitrary extensions, local paths, and unreviewed provider options.
`PutCharacterDocumentSchema` requires an expected revision and mutation id.
`ContactListSchema` includes deletion markers; absence is not proof of deletion.
Use these contracts for cloud replication, not lossless local card backups.

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

## License

[MIT](../../../LICENSE)
