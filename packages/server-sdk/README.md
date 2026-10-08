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

### Read chat images and recordings

Chat events, such as `output:gen-ai:chat:message`, do not carry image or audio bytes. A message part holds a reference such as `airi-asset:<id>` in place of them. Read the bytes with `getAsset`:

```typescript
import { ASSET_REF_PREFIX } from '@proj-airi/server-sdk'

client.onEvent('output:gen-ai:chat:message', async (event) => {
  const content = event.data['gen-ai:chat']?.message.content
  if (!Array.isArray(content))
    return

  for (const part of content) {
    if (part.type === 'input_audio' && part.input_audio.data.startsWith(ASSET_REF_PREFIX)) {
      const { mimeType, data } = await client.getAsset(part.input_audio.data)
      console.info(mimeType, data.byteLength)
    }
  }
})
```

The stage answers the request. `getAsset` rejects when the asset is missing, when it is larger than 50 MB, or when no stage answers within 10 seconds.

The stage answers only a client that announced a module. The server tells the stage which connection asked, and the answer goes back to that connection only.
- `client.onEvent()` returns an unsubscribe function

## License

[MIT](../../LICENSE)
