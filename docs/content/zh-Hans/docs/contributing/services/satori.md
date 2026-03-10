---
title: Satori Bot
description: 参与并贡献 Project AIRI
---

### Satori Bot / 机器人

```shell
cd services/satori-bot
```

配置 `.env` 文件：

```shell
cp .env .env.local
```

编辑 `.env.local` 中的各类密钥和配置信息。

启动机器人：

```shell
pnpm -F @proj-airi/satori-bot dev
```

::: tip

如果你使用 [@antfu/ni](https://github.com/antfu-collective/ni)，你可以：

```shell
nr -F @proj-airi/satori-bot dev
```

:::
