---
title: Satori Bot
description: Bridge AIRI to multiple messaging platforms through Koishi and the Satori protocol
---

The Satori bot connects to messaging platforms such as QQ, Telegram, Discord, and Lark through Koishi's Satori service. The current standalone core is transitional and is suitable for experiments and maintenance; it should not be treated as a stable AIRI Core integration.

## Prerequisites

- Install dependencies from the repository root with **pnpm i**.
- Run a Koishi instance with the **server-satori** plugin enabled.
- Provide a model service with an OpenAI-compatible API.

::: warning Credential security
Keep the Satori token, messaging-platform credentials, and model API keys only in the local **.env.local** file. Do not commit, screenshot, or share these values.
:::

## Configure

```bash
cp integrations/satori-bot/.env integrations/satori-bot/.env.local
```

Edit **integrations/satori-bot/.env.local** and provide **SATORI_WS_URL**, **SATORI_API_BASE_URL**, the optional **SATORI_TOKEN**, and the LLM address, key, and model.

## Start

```bash
pnpm -F @proj-airi/satori-bot dev
```

## Notes

Messaging-platform addresses, tokens, and model credentials are sensitive. Do not commit **.env.local** or send its contents to anyone.
