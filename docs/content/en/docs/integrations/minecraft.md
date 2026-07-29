---
title: Minecraft Agent
description: Run AIRI's local game agent on a trusted Minecraft server
---

The Minecraft integration uses Mineflayer to connect AIRI to a Minecraft server so the agent can receive context, perform in-game actions, and report state. It is intended for local development and maintenance. The current implementation is planned to migrate to a Fabric runtime, so avoid building new long-term features around it.

## Prerequisites

- Install dependencies from the repository root with **pnpm i**.
- Provide a reachable local or trusted Minecraft server. The connection address and port come from the environment configuration.
- Prepare working AIRI and model-service settings.

::: warning Credential security
Keep API keys, service addresses, and Minecraft server credentials only in the local **.env.local** file. Do not commit, screenshot, or share these values.
:::

## Configure

```bash
cp services/minecraft/.env services/minecraft/.env.local
```

Edit **services/minecraft/.env.local** and provide the required Minecraft server, AIRI, and model-service settings.

## Start

```bash
pnpm -F @proj-airi/minecraft-bot dev
```

After startup, the agent connects to AIRI and the Minecraft server. Use the terminal output to verify connection and action status during development.

## Security and limitations

Do not connect the agent to an untrusted public server. It controls a local Minecraft session and network connection. Even when action planning runs in an isolated environment, a malicious server may still cause unexpected behavior.
