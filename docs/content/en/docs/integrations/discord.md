---
title: Discord Bot
description: Run AIRI as a voice and messaging bot using a Discord application
---

The Discord bot connects to text and voice channels in a Discord server. Text replies come from the chat provider and model selected in AIRI.

## Prerequisites

- Install dependencies from the repository root with **pnpm i**.
- Create an application and bot in the [Discord Developer Portal](https://discord.com/developers/home).
- Enable **Message Content Intent** in the bot settings.
- Configure a working chat provider and model in AIRI.

::: warning Credential security
Keep the Bot Token and AIRI Auth Token only in AIRI's local settings or the bot service's local **.env.local** file. Do not commit, screenshot, or share these credentials.
:::

## Configure the bot service

```bash
cp integrations/discord-bot/.env integrations/discord-bot/.env.local
```

In AIRI Desktop, open **Settings → Connection**. Show and copy the **Auth Token**, then add these values to **integrations/discord-bot/.env.local**:

```env
AIRI_URL=ws://localhost:6121/ws
AIRI_TOKEN=<Auth Token from Settings → Connection>
```

`DISCORD_TOKEN` is an optional startup fallback. You can leave it empty and send the Bot Token from AIRI after the service connects. The service does not use `DISCORD_BOT_CLIENT_ID`, `OPENAI_MODEL`, `OPENAI_API_*`, or `ELEVENLABS_*`; Discord text replies use AIRI's active chat configuration.

For Discord voice input, configure an OpenAI-compatible transcription endpoint with `OPENAI_STT_API_BASE_URL`, `OPENAI_STT_API_KEY`, and `OPENAI_STT_MODEL`. These values are not required for text channels, but voice transcription cannot complete without them.

## Start the service

```bash
pnpm -F @proj-airi/discord-bot start
```

## Configure Discord in AIRI

1. Open **Settings → Modules → Discord**.
2. Paste the bot token into **Bot Token**.
3. Turn on **Enable Discord Integration**.
4. Click **Save**.

The authenticated bot service receives the enabled state and token through AIRI's configuration channel. If the service is not running or its AIRI Auth Token is missing or incorrect, saving these fields alone does not start the Discord bot.

## Install and use the bot in Discord

1. In the Discord Developer Portal, configure a **Guild Install** with the `bot` scope and install the bot in your server. The `bot` scope includes `applications.commands` by default. Grant only the permissions required by the features you use:
   - Text replies: **View Channels** and **Send Messages**.
   - Voice input: **View Channels** and **Connect**.
   - Voice playback: **Speak**.
2. For text chat, send the bot a direct message or mention it in a server channel. The bot does not respond to every server message.
3. For voice input, join a voice channel and run `/summon`. The service registers `/ping` and `/summon` after the bot logs in.

If the bot works in some channels but not others, check the channel-level permission overrides.

## Security notes

Limit the bot's access to the channels and capabilities it needs. If the Bot Token is lost or exposed, reset it immediately in the Discord Developer Portal.
