---
title: Minecraft Agent
description: Run AIRI's local game agent on a trusted Minecraft server
---

The Minecraft integration uses Mineflayer to connect AIRI to a Minecraft server. The agent receives context, performs in-game actions, and reports state. The integration is intended for local development and maintenance. The current implementation is planned to migrate to a Fabric runtime. Do not build new long-term features around it.

::: warning Source installation required
The Minecraft agent currently works only when run from source. Follow [the contributor guide](/en/docs/contributing/) to set up a local development environment.
:::

## Prerequisites

- Install dependencies from the repository root.

```bash
pnpm i
```

- Provide a reachable local or trusted Minecraft server. The connection address and port come from the configuration file.
- Prepare working AIRI and model-service settings.
- Provide an OpenAI-compatible API.

::: warning Credential security
Keep API keys, service addresses, and Minecraft server credentials only in the local **.env.local** file. Do not commit, screenshot, or share these values.
The API key in this file is separate from the API key in AIRI. The keys are not interchangeable. Use a dedicated key for the Minecraft service.
:::

## Configure

```bash
cp integrations/minecraft/.env integrations/minecraft/.env.local
```

Edit **integrations/minecraft/.env.local** and provide the required Minecraft server, AIRI, and model-service settings.

In the Desktop ver., open **Settings → Connection**. Show and copy the **Auth Token**. Then add these AIRI channel settings:

```env
AIRI_WS_BASEURL=ws://localhost:6121/ws
AIRI_CLIENT_NAME=minecraft-bot
AIRI_WS_TOKEN=<Auth Token from Settings → Connection>
```

Also configure the values required by your server and model service. The following table uses DeepSeek as an example:

| Field | Meaning | Recommendation |
| --- | --- | --- |
| `OPENAI_API_BASEURL` | Root URL of the provider API | Use a URL such as `https://api.deepseek.com`. Do not append `chat/completions`. |
| `OPENAI_API_KEY` | Access token issued by the provider | Paste the complete key between the quotation marks. |
| `OPENAI_MODEL` | Default model ID | Enter a general model ID, such as `deepseek-v4-flash`. |
| `OPENAI_REASONING_MODEL` | Reasoning model ID | Select a stronger model that supports reasoning, such as `deepseek-v4-pro`. |
| `BOT_USERNAME` | In-game name of the bot | Use only letters, numbers, and underscores when possible. |
| `BOT_HOSTNAME` | Server address | Enter the server address or IP. Use `localhost` for a local server. |
| `BOT_PORT` | Server port | `25565` is common. Enter the port that the server exposes. |
| `BOT_VERSION` | Server version | Enter the Minecraft version, such as `1.21.1`. |

The default login mode is offline. For Microsoft account login, read the comments in **integrations/minecraft/.env**.

## Start

```bash
pnpm -F @proj-airi/minecraft-bot dev
```

After startup, the agent connects to AIRI and the Minecraft server. In a development environment, read the terminal log to confirm the connection and action status. Send a text message in the game to interact with AIRI.
A missing or incorrect `AIRI_WS_TOKEN` prevents the module from registering with AIRI.

## Security and limitations

Do not connect the agent to an untrusted public server. It controls a local Minecraft session and network connection. Action planning can run in an isolated environment. A malicious server can still cause unexpected behavior.
