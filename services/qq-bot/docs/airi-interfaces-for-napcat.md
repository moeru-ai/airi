# AIRI Interfaces For NapCat Adapter

This document describes the minimum AIRI-side interface contract you need when writing your own NapCat adapter.

## Transport

- Connect AIRI server websocket: default `ws://localhost:6121/ws`.
- Use `@proj-airi/server-sdk` `Client` (recommended), or raw websocket with compatible event frames.

## Module Registration

Your module client name should be:

- `qq`

Reason:
- UI sends `ui:configure` with `moduleName: "qq"`.
- `server-runtime` forwards that to the peer that announced itself as `qq` via `module:configure`.

## Events You Must Handle

### 1) `module:configure` (from AIRI)

Payload shape:

```json
{
  "config": {
    "enabled": true,
    "method": "napcat",
    "officialToken": "",
    "napcatWsUrl": "ws://127.0.0.1:3001"
  }
}
```

Use fields:
- `enabled`: start/stop NapCat bridge.
- `method`: only run when `method === "napcat"`.
- `napcatWsUrl`: NapCat websocket endpoint.

### 2) `output:gen-ai:chat:message` (from AIRI)

You need:
- Assistant text: `event.data.message.content`.
- Source context (your inbound metadata): `event.data["gen-ai:chat"].input.data.qq` (or your own field).

Recommended inbound metadata (`qq`):

```json
{
  "kind": "c2c",
  "messageId": "xxx",
  "userOpenId": "xxx",
  "groupOpenId": "xxx",
  "channelId": "xxx"
}
```

Use this to route reply to the same chat target in NapCat.

## Events You Must Send To AIRI

### `input:text`

On every inbound NapCat text message, send:

```json
{
  "type": "input:text",
  "data": {
    "text": "cleaned text",
    "textRaw": "raw text",
    "overrides": {
      "sessionId": "qq-group-123",
      "messagePrefix": "(From QQ user Alice): "
    },
    "contextUpdates": [
      {
        "strategy": "append-self",
        "text": "Input source: QQ group, messageId=abc.",
        "content": "Input source: QQ group, messageId=abc.",
        "metadata": {
          "qq": {
            "kind": "group",
            "messageId": "abc",
            "groupOpenId": "123"
          }
        }
      }
    ],
    "qq": {
      "kind": "group",
      "messageId": "abc",
      "groupOpenId": "123"
    }
  }
}
```

Notes:
- `sessionId` controls memory partitioning; keep it stable per chat target.
- `messagePrefix` helps AIRI understand sender/source.
- `contextUpdates` is optional but recommended for richer context.

## Practical SessionId Strategy

- Private chat: `qq-c2c-${userId}`
- Group chat: `qq-group-${groupId}`
- Channel: `qq-channel-${channelId}`

## Minimal Event Set For NapCat Adapter

- Receive: `module:configure`, `output:gen-ai:chat:message`
- Send: `input:text`

This is enough to complete text receive/reply loop.
