---
title: Discord Bot
description: Run AIRI as a voice and messaging bot using a Discord application and model services
---

The Discord bot connects to text and voice channels in a Discord server and uses configured model services to generate replies.

## Prerequisites

- Install dependencies from the repository root with **pnpm i**.
- Create an application and bot in the [Discord Developer Portal](https://discord.com/developers/home).
- Enable **Message Content Intent** in the bot settings.
- Prepare credentials for a chat model and speech service.

::: warning Credential security
Keep the Discord Bot Token in AIRI's local settings or the bot service's local **.env.local** file. Keep the Client ID and model-service credentials in **.env.local**. Do not commit, screenshot, or share these credentials.
:::

## Configure the bot service

```bash
cp services/discord-bot/.env services/discord-bot/.env.local
```

Edit **services/discord-bot/.env.local** and provide **DISCORD_BOT_CLIENT_ID** and the required chat-model and speech-service settings. **DISCORD_TOKEN** is an optional startup fallback; you can instead send the token from AIRI after the service starts. If the Discord token is lost or exposed, reset it immediately in the developer portal.

## Start the service

```bash
pnpm -F @proj-airi/discord-bot start
```

## Configure Discord in AIRI

1. Open **Settings → Modules → Discord**.
2. Paste the bot token into **Discord Bot Token**.
3. Turn on **Enable Discord Integration**.
4. Click **Save**.

The running bot service receives the enabled state and token through AIRI's configuration channel. If the service is not running or connected, saving these fields alone does not start the Discord bot.

## Notes

Before inviting the bot to a server, limit its permissions to the channels and capabilities it needs. Never commit the Bot Token or other service credentials.
