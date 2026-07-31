---
title: Telegram Bot
description: Run AIRI as a Telegram bot using PostgreSQL and model services
---

The Telegram bot requires a Telegram Bot Token, a PostgreSQL vector database, and model services. The repository Compose service runs PostgreSQL with pgvecto.rs 0.4.0 in pgvector compatibility mode. The bot is intended to be run from source.

## Prerequisites

- Install dependencies from the repository root with **pnpm i**.
- Create a Telegram bot with [@BotFather](https://t.me/BotFather) and obtain its token.
- Make Docker available to start the repository's PostgreSQL vector service.
- Prepare chat-model and embedding-model services.

::: warning Credential security
Keep the Telegram Bot Token, database connection, and model API keys only in the local **.env.local** file. Do not commit, screenshot, or share these values.
:::

## Configure

```bash
cp services/telegram-bot/.env services/telegram-bot/.env.local
```

Edit **services/telegram-bot/.env.local** and provide **TELEGRAM_BOT_TOKEN**, the database connection, and the chat-model and embedding-model settings. The embedding service's output size must match `EMBEDDING_DIMENSION`; supported values are `768`, `1024`, and `1536`.

## Initialize the database

```bash
cd services/telegram-bot
docker compose up -d --wait pgvector
cd ../..
pnpm -F @proj-airi/telegram-bot db:push
```

The repository Compose file exposes PostgreSQL on host port `5433`. When using that service, set:

```env
DATABASE_URL=postgres://postgres:123456@localhost:5433/postgres
```

Starting only `pgvector` avoids launching the optional Grafana, Tempo, Prometheus, and OpenTelemetry services.

## Start

```bash
pnpm -F @proj-airi/telegram-bot start
```

## Notes

The database, Telegram token, and model credentials are sensitive. Do not commit **.env.local**. Before the first deployment, also confirm the database backup and access-control arrangements.
