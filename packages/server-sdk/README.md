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

Chat events do not carry image or audio bytes. `output:gen-ai:chat:message` lists the images and recordings of the user message in `gen-ai:chat.attachments`, each with a reference such as `airi-asset:<id>`. Read the bytes with `getAsset`:

```typescript
client.onEvent('output:gen-ai:chat:message', async (event) => {
  for (const attachment of event.data['gen-ai:chat']?.attachments ?? []) {
    const { mimeType, data } = await client.getAsset(attachment.ref)
    console.info(attachment.type, mimeType, data.byteLength, attachment.transcript)
  }
})
```

The stage answers the request. `getAsset` rejects when the asset is missing, when it is larger than 50 MB, or when no stage answers within 10 seconds.

The stage answers only a client that announced a module. The server tells the stage which connection asked, and the answer goes back to that connection only.
- `client.onEvent()` returns an unsubscribe function

## License

[MIT](../../LICENSE)
