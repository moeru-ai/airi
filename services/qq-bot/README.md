# `qq-bot`

Official QQ adapter service for AIRI.

## What It Does

- Connects to QQ official gateway (`bot.q.qq.com` / `api.sgroup.qq.com`).
- Receives QQ events (`C2C_MESSAGE_CREATE`, `GROUP_AT_MESSAGE_CREATE`, `AT_MESSAGE_CREATE`).
- Forwards inbound QQ text to AIRI via websocket event `input:text`.
- Sends AIRI assistant output (`output:gen-ai:chat:message`) back to QQ.

## What It Does Not Do (Current Scope)

- NapCat support (you will implement it yourself).
- Rich media relay (image/audio/file/video).
- Advanced rate-limit and msg-seq strategy.

## Configuration

This adapter listens to AIRI `ui:configure` -> `module:configure` for module `qq`:

```json
{
  "enabled": true,
  "method": "official",
  "officialToken": "AppID:AppSecret"
}
```

- `method !== "official"` will put this adapter in idle mode.
- `officialToken` must be `AppID:AppSecret`.

Optional env bootstrap (before UI config arrives):

- `QQ_OFFICIAL_TOKEN=AppID:AppSecret`
- `AIRI_URL=ws://localhost:6121/ws`
- `AIRI_TOKEN=abcd`

## Run

```bash
pnpm -F @proj-airi/qq-bot start
```

## When to Use

- You want AIRI to receive and reply QQ official bot text messages through module configuration in Settings.

## When Not to Use

- You need NapCat transport.
- You need production-grade rich media and complete QQ platform behavior support.
