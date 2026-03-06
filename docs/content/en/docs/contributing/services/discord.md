---
title: Discord Bot
description: Contribute to Project AIRI
---

### Discord bot integration

```shell
cd services/discord-bot
```

Configure `.env`

```shell
cp .env .env.local
```

Edit the credentials in `.env.local`.

Run the bot

```shell
pnpm -F @proj-airi/discord-bot start
```

::: tip

For [@antfu/ni](https://github.com/antfu-collective/ni) users, you can

```shell
nr -F @proj-airi/discord-bot dev
```

:::
