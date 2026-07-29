---
title: Telegram Bot
description: Run AIRI as a Telegram bot using Postgres and model services
---

The Telegram bot requires a Telegram Bot Token, Postgres with pgvector, and model services. It is intended to be run from source.

## Prerequisites

- Install dependencies from the repository root with **pnpm i**.
- Create a Telegram bot with [@BotFather](https://t.me/BotFather) and obtain its token.
- Make Docker available to start the repository's Postgres and pgvector services.
- Prepare chat-model and embedding-model services.

::: warning Credential security
Keep the Telegram Bot Token, database connection, and model API keys only in the local **.env.local** file. Do not commit, screenshot, or share these values.
:::

## Configure

```bash
cp services/telegram-bot/.env services/telegram-bot/.env.local
```

Edit **services/telegram-bot/.env.local** and provide **TELEGRAM_BOT_TOKEN**, the database connection, and the chat-model and embedding-model settings.

## Initialize the database

```bash
cd services/telegram-bot
docker compose up -d
cd ../..
pnpm -F @proj-airi/telegram-bot db:push
```

## Start

```bash
pnpm -F @proj-airi/telegram-bot start
```

## Notes

The database, Telegram token, and model credentials are sensitive. Do not commit **.env.local**. Before the first deployment, also confirm the database backup and access-control arrangements.
