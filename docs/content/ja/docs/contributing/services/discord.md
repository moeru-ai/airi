---
title: Discord Bot
description: Project AIRI への貢献
---

### Discord bot 統合

```shell
cd services/discord-bot
```

`.env` の設定

```shell
cp .env .env.local
```

`.env.local` 内の認証情報を編集します。

ボットの実行

```shell
pnpm -F @proj-airi/discord-bot start
```

::: tip

[@antfu/ni](https://github.com/antfu-collective/ni) ユーザーの場合：

```shell
nr -F @proj-airi/discord-bot dev
```

:::
