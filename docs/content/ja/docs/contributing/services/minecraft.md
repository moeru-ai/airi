---
title: Minecraft
description: Project AIRI への貢献
---

### Minecraft エージェント

```shell
cd services/minecraft
```

Minecraft クライアントを起動し、希望のポートでワールドを公開し、そのポート番号を `.env.local` に記入します。

`.env` の設定

```shell
cp .env .env.local
```

`.env.local` 内の認証情報を編集します。

ボットの実行

```shell
pnpm -F @proj-airi/minecraft-bot start
```

::: tip

[@antfu/ni](https://github.com/antfu-collective/ni) ユーザーの場合：

```shell
nr -F @proj-airi/minecraft-bot dev
```

:::
