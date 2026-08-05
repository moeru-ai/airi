---
title: Satori Bot
description: Bridge multiple messaging platforms via the Satori protocol and Koishi
---


The Satori bot connects to messaging platforms such as QQ, Telegram, Discord, and Lark through Koishi's Satori service. The currently standalone core is a transitional implementation, suitable for experimentation and maintenance, and should not be considered a stable AIRI Core integration.


## Prerequisites


* Dependencies installed at the repository root: **pnpm i**.
* A Koishi instance running with the **server-satori** plugin enabled.
* A model service with an OpenAI-compatible interface.


::: warning Credential Security


Satori tokens, messaging platform credentials, and model API keys should only be stored in the local **.env.local** file. Do not commit, screenshot, or share these configurations.


:::


## Configuration

~~~bash
cp integrations/satori-bot/.env integrations/satori-bot/.env.local
~~~


Edit **integrations/satori-bot/.env.local** and fill in **SATORI_WS_URL**, **SATORI_API_BASE_URL**, the optional **SATORI_TOKEN**, and the LLM's address, key, and model.


## Start

~~~bash
pnpm -F @proj-airi/satori-bot dev
~~~


## Notes


Messaging platform connection addresses, tokens, and model credentials are all sensitive configuration. Do not commit **.env.local** or share its contents with others.

