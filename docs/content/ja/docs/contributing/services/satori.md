---
title: Satori Bot
description: Project AIRI への貢献
---

### Satori Bot / ボット

```shell
cd services/satori-bot
```

`.env` ファイルの設定：

```shell
cp .env .env.local
```

`.env.local` 内の各種キーや設定情報を編集します。

ボットの起動：

```shell
pnpm -F @proj-airi/satori-bot dev
```

::: tip

[@antfu/ni](https://github.com/antfu-collective/ni) を使用している場合、以下のように実行できます：

```shell
nr -F @proj-airi/satori-bot dev
```

:::
