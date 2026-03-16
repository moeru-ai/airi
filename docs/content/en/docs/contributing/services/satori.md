---
title: Satori Bot
description: Contribute to Project AIRI
---

### Satori Bot

```shell
cd services/satori-bot
```

### Connect QQ (via Koishi + Satori)

If you want AIRI to chat in QQ, see: [QQ Bot (Koishi + Satori)](./qq.md).

Configure the `.env` file:

```shell
cp .env .env.local
```

Edit various keys and configuration information in `.env.local`.

Start the bot:

```shell
pnpm -F @proj-airi/satori-bot dev
```

::: tip

If you use [@antfu/ni](https://github.com/antfu-collective/ni), you can:

```shell
nr -F @proj-airi/satori-bot dev
```

:::
