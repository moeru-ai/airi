# @proj-airi/server-sdk-shared

Versioned Eventa contracts for the hosted chat WebSocket.

## Usage

```shell
ni @proj-airi/server-sdk-shared -D
pnpm i @proj-airi/server-sdk-shared -D
```

```typescript
import type { WireMessage } from '@proj-airi/server-sdk-shared'

import { newMessages, pullMessages, sendMessages } from '@proj-airi/server-sdk-shared'
```

The package exports two Eventa contract sets:

- `@proj-airi/server-sdk-shared/v1` keeps the Eventa `0.3.0` wire format.
- `@proj-airi/server-sdk-shared/v2` uses Eventa `1.0.0-beta.15`.

## License

[MIT](../../../LICENSE)
