---
title: QQ Bot (Koishi + Satori)
description: Contribute to Project AIRI
---

### QQ Bot (Koishi + Satori)

For QQ integration, AIRI currently recommends using **Koishi** as a bridge, while **Satori Protocol** provides unified events and messaging APIs to AIRI.

#### 1) Prepare QQ connectivity in Koishi

- Install and start Koishi
- Install and configure a QQ adapter of your choice (for example, a OneBot-based adapter, an official QQ bot adapter, or any other QQ connectivity solution)
- Enable the `server-satori` plugin in Koishi and make sure:
  - WebSocket Events is available (commonly `/satori/v1/events`)
  - HTTP API is available (commonly `/satori/v1`)
  - If auth is enabled, note down the Token (set it to `SATORI_TOKEN`)

##### Official QQ bot: event delivery

If you use an official QQ bot platform, it typically provides two ways to receive message events (refer to the official documentation for exact details):

- Webhook/HTTP callback: the platform pushes events to your callback URL
- WebSocket gateway: your service connects to a gateway and receives events over WS

In this project, it’s recommended to keep the “official delivery” integration inside Koishi/adapters, then let `server-satori` translate everything into a Satori event stream for AIRI.

#### 2) Run AIRI Satori Bot

```shell
cd services/satori-bot
cp .env .env.local
```

Edit `.env.local` and configure:

```env
# Event stream WS: usually Koishi server-satori, but can also be your own Satori gateway
SATORI_WS_URL=ws://localhost:5140/satori/v1/events
# Messaging HTTP API: typically same host/prefix as the WS endpoint
SATORI_API_BASE_URL=http://localhost:5140/satori/v1
SATORI_TOKEN=
```

Then start:

```shell
pnpm -F @proj-airi/satori-bot dev
```

#### 3) Verify

- Send a message in the connected QQ DM or group
- Check the `services/satori-bot` logs for incoming Satori events and outgoing replies

#### 3.1) Using a custom WS endpoint

If you can’t use Koishi’s default local endpoint (for example, you need a public domain, a reverse proxy, or cross-machine deployment), point `SATORI_WS_URL` to your custom WebSocket endpoint, e.g.:

```env
SATORI_WS_URL=wss://example.com/satori/v1/events
SATORI_API_BASE_URL=https://example.com/satori/v1
```

This requires the WS/HTTP endpoints to speak the **Satori protocol** (AIRI Satori Bot parses Satori events and sends messages via Satori APIs).

#### 4) About “memory”

`services/satori-bot` currently runs as a standalone AIRI sub-module and persists messages and queue state in a local database (default: `services/satori-bot/data/pglite-db`) for conversation continuity and crash recovery. It will be progressively migrated into AIRI’s unified core memory system once the main framework is stable.
