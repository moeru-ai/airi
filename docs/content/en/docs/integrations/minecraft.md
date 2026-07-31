---
title: Minecraft Agent
description: Run AIRI's local game agent on a trusted Minecraft server
---

The Minecraft integration uses Mineflayer to connect AIRI to a Minecraft server so the agent can receive context, perform in-game actions, and report state. It is intended for local development and maintenance. The current implementation is planned to migrate to a Fabric runtime, so avoid building new long-term features around it.

## Prerequisites

- Install dependencies from the repository root with **pnpm i**.
- Provide a reachable local or trusted Minecraft server. The connection address and port come from the environment configuration.
- Configure a working chat provider and model in AIRI, and prepare the OpenAI-compatible model settings used by the Minecraft agent.

::: warning Credential security
Keep API keys, service addresses, and Minecraft server credentials only in the local **.env.local** file. Do not commit, screenshot, or share these values.
:::

## Configure

```bash
cp services/minecraft/.env services/minecraft/.env.local
```

Edit **services/minecraft/.env.local** and provide the required Minecraft server, AIRI, and model-service settings.

In AIRI Desktop, open **Settings → Connection**, show and copy the **Auth Token**, and add these AIRI channel settings:

```env
AIRI_WS_BASEURL=ws://localhost:6121/ws
AIRI_CLIENT_NAME=minecraft-bot
AIRI_WS_TOKEN=<Auth Token from Settings → Connection>
```

Also configure `BOT_HOSTNAME`, `BOT_PORT`, and the `OPENAI_API_BASEURL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_REASONING_MODEL` values required by your server and model service. Keep the defaults only when they match your local setup.

## Start

```bash
pnpm -F @proj-airi/minecraft-bot dev
```

After startup, use the terminal output to verify that authentication to AIRI succeeds and that the agent connects to the Minecraft server. A missing or incorrect `AIRI_WS_TOKEN` prevents the module from registering with AIRI.

## Security and limitations

Do not connect the agent to an untrusted public server. It controls a local Minecraft session and network connection. Even when action planning runs in an isolated environment, a malicious server may still cause unexpected behavior.
