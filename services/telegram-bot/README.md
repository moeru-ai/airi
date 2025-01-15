# `telegram-bot`

Allow アイリ to talk to you and many other users in Telegram.

## Getting started

Clone & install dependencies:

```shell
git clone git@github.com:moeru-ai/airi.git
pnpm i
```

Create a `.env.local` file:

```shell
cd services/telegram-bot
cp .env .env.local
```

Fill-in the following credentials as configurations:

```shell
DISCORD_TOKEN=''
DISCORD_BOT_CLIENT_ID=''

OPENAI_MODEL=''
OPENAI_API_KEY=''
OPENAI_API_BASE_URL=''
```

Start both DB and the bot:

```shell
docker compose up -d
pnpm run -F @proj-airi/telegram-bot start
```
