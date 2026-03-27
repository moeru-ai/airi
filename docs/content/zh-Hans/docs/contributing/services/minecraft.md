---
title: Minecraft
description: 参与并贡献 Project AIRI
---

### Minecraft（我的世界）Agent / NPC

```shell
cd services/minecraft
```

启动 Minecraft（我的世界）客户端并导出世界到指定的端口。请在 `.env.local` 中配置端口。

配置 `.env` 文件：

```shell
cp .env .env.local
```

编辑 `.env.local` 中的各类密钥和配置信息。

启动机器人：

```shell
pnpm -F @proj-airi/minecraft-bot start
```

::: tip

如果你使用 [@antfu/ni](https://github.com/antfu-collective/ni)，你可以：

```shell
nr -F @proj-airi/minecraft-bot dev
```

:::
