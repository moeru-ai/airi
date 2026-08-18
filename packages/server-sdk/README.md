# @proj-airi/server-sdk

The SDK for cliet-side code to connect to the server-side components.

## Usage

```shell
ni @proj-airi/server-sdk -D # from @antfu/ni, can be installed via `npm i -g @antfu/ni`
pnpm i @proj-airi/server-sdk -D
yarn i @proj-airi/server-sdk -D
npm i @proj-airi/server-sdk -D
```

```typescript
import { Client } from '@proj-airi/server-sdk'

const client = new Client({
  name: 'your airi plugin',
  autoConnect: false,
})

await client.connect()

client.onEvent('input:text', async (event) => {
  console.info(event.data.text)
})
```

`connect()` now resolves when the client is fully ready for use, not just when the websocket transport has opened. In practice that means:

- the socket is open
- authentication succeeded when a token is configured
- the module has announced itself successfully

Useful runtime helpers:

- `client.connectionStatus` exposes the current lifecycle state
- `client.isReady` tells you whether the client has completed authentication + announce
- `client.send()` returns `false` instead of silently dropping messages when the socket is unavailable
- `client.sendOrThrow()` is available when you want strict delivery semantics
- `client.onEvent()` returns an unsubscribe function

## License

[MIT](../../LICENSE)
