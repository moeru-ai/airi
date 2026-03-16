---
title: QQ Bot (Koishi + Satori)
description: Contribute to Project AIRI
---

### QQ Bot (Koishi + Satori)

For QQ integration, AIRI currently recommends using **Koishi** as a bridge, while **Satori Protocol** provides unified events and messaging APIs to AIRI.

#### 1) Prepare QQ connectivity in Koishi

- Install and start Koishi
- Install and configure a QQ adapter of your choice (for example, a OneBot-based adapter, or any other QQ connectivity solution)
- Enable the `server-satori` plugin in Koishi and make sure:
  - WebSocket Events is available (commonly `/satori/v1/events`)
  - HTTP API is available (commonly `/satori/v1`)
  - If auth is enabled, note down the Token (set it to `SATORI_TOKEN`)

#### 2) Run AIRI Satori Bot

```shell
cd services/satori-bot
cp .env .env.local
```

Edit `.env.local` and configure:

```env
SATORI_WS_URL=ws://localhost:5140/satori/v1/events
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

#### 4) About “memory”

`services/satori-bot` currently runs as a standalone AIRI sub-module and persists messages and queue state in a local database (default: `services/satori-bot/data/pglite-db`) for conversation continuity and crash recovery. It will be progressively migrated into AIRI’s unified core memory system once the main framework is stable.

