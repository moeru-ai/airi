# `continuous-bot` (WIP)

Clone & install dependencies:

```shell
git clone git@github.com:moeru-ai/airi.git
pnpm install
cd services/continuous-bot
```

Run the bot:

```shell
docker compose up -d

OPENAI_API_BASE_URL='https://openrouter.ai/api/v1/' \
OPENAI_API_KEY='<API Token>' \
TELEGRAM_BOT_TOKEN='<Bot Token>' \
pnpm run start
```
