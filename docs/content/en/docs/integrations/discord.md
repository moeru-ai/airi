---
title: Discord Bot
description: Run AIRI voice and messaging bots with a Discord application and a model service
---


The Discord bot connects to the message and voice channels of a Discord server and uses the configured model service to generate replies.


## Prerequisites


* Dependencies installed at the repository root: **pnpm i**.
* An application and bot created in the [Discord Developer Portal](https://discord.com/developers/home).
* **Server Members Intent** and **Message Content Intent** enabled in the bot settings.
* Chat model and speech service credentials prepared.


::: warning Credential Security


Discord Bot Tokens, Client IDs, and model API keys should only be stored in the local **.env.local** file. Do not commit, screenshot, or share these configurations.


:::


## Configuration

~~~bash

cp integrations/discord-bot/.env integrations/discord-bot/.env.local

~~~


Edit **integrations/discord-bot/.env.local** and fill in **DISCORD_TOKEN**, **DISCORD_BOT_CLIENT_ID**, and the chat model and speech service configuration. If the Discord token is lost or leaked, reset it immediately in the developer console.


## Start

~~~bash

pnpm -F @proj-airi/discord-bot start

~~~


## Notes


Before inviting the bot to a server, confirm the application permissions only cover the channels and capabilities needed. Do not commit the bot token or other service credentials to the repository.

