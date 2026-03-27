---
title: Minecraft
description: Contribute to Project AIRI
---

### Minecraft agent

```shell
cd services/minecraft
```

Start a Minecraft client, export your world with desired port, and fill-in the port number in `.env.local`.

Configure `.env`

```shell
cp .env .env.local
```

Edit the credentials in `.env.local`.

Run the bot

```shell
pnpm -F @proj-airi/minecraft-bot start
```

::: tip

For [@antfu/ni](https://github.com/antfu-collective/ni) users, you can

```shell
nr -F @proj-airi/minecraft-bot dev
```

:::
