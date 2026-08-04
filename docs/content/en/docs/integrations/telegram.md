---
title: Telegram Bot
description: Run an AIRI messaging bot with a Telegram bot, Postgres, and a model service
---


The Telegram bot requires a Telegram Bot Token, Postgres (with pgvector), and a model service. It is aimed at run-from-source integration scenarios.


## Prerequisites


* Dependencies installed at the repository root: **pnpm i**.
* A Telegram bot created via [@BotFather](https://t.me/BotFather) and its Token obtained.
* Docker available for starting the Postgres and pgvector services provided by the repository.
* Usable chat model and embedding model services.


::: warning Credential Security


Telegram Bot Tokens, database connections, and model API keys should only be stored in the local **.env.local** file. Do not commit, screenshot, or share these configurations.


:::


## Configuration

~~~bash

cp integrations/telegram-bot/.env integrations/telegram-bot/.env.local

~~~


Edit **integrations/telegram-bot/.env.local** and fill in **TELEGRAM_BOT_TOKEN**, the database connection, and the chat model and embedding model configuration.


## Initialize the Database

~~~bash

cd integrations/telegram-bot

docker compose up -d

cd ../..

pnpm -F @proj-airi/telegram-bot db:push

~~~


## Start

~~~bash

pnpm -F @proj-airi/telegram-bot start

~~~


## Notes


The database, Telegram token, and model credentials are all sensitive information. Do not commit **.env.local**; before the first deployment, also confirm database backups and access control.

