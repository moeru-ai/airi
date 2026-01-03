---
title: コントリビューション
description: Project AIRI への貢献
---

こんにちは！このプロジェクトへの貢献に興味を持っていただきありがとうございます。このガイドは、あなたが始めるのに役立ちます。

## 前提条件

- [Git](https://git-scm.com/downloads)
- [Node.js 23+](https://nodejs.org/en/download/)
- [corepack](https://github.com/nodejs/corepack)
- [pnpm](https://pnpm.io/installation)

<details>
<summary>Windows のセットアップ</summary>

0. [Visual Studio](https://visualstudio.microsoft.com/downloads/) をダウンロードし、こちらの指示に従ってください: https://rust-lang.github.io/rustup/installation/windows-msvc.html#walkthrough-installing-visual-studio-2022

   > Visual Studio をインストールする際、Windows SDK と C++ ビルドツールを必ずインストールしてください。

1. PowerShell を開く
2. [`scoop`](https://scoop.sh/) をインストール

   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
   ```

3. `scoop` を使って `git`, Node.js, `rustup`, `msvc` をインストール

   ```powershell
   scoop install git nodejs rustup

   # Rust の依存関係用
   # crates または apps/tamagotchi の開発を行わない場合は不要です
   scoop install main/rust-msvc
   # Rust & Windows 固有
   rustup toolchain install stable-x86_64-pc-windows-msvc
   rustup default stable-x86_64-pc-windows-msvc
   ```

4. `corepack` を使って `pnpm` をインストール

   ```powershell
   corepack enable
   corepack prepare pnpm@latest --activate
   ```

</details>

<details>
<summary>macOS のセットアップ</summary>

0. Terminal (または iTerm2, Ghostty, Kitty など) を開く
1. `brew` を使って `git`, `node` をインストール

   ```shell
   brew install git node
   ```

2. `corepack` を使って `pnpm` をインストール

   ```shell
   corepack enable
   corepack prepare pnpm@latest --activate
   ```

</details>

<details>
<summary>Linux のセットアップ</summary>

0. Terminal を開く
1. [nodesource/distributions: NodeSource Node.js Binary Distributions](https://github.com/nodesource/distributions?tab=readme-ov-file#table-of-contents) に従って `node` をインストール
2. [Git](https://git-scm.com/downloads/linux) に従って `git` をインストール
3. `corepack` を使って `pnpm` をインストール

   ```shell
   corepack enable
   corepack prepare pnpm@latest --activate
   ```
4. デスクトップ版の開発を手助けしたい場合は、以下の依存関係が必要です：
   ```
   sudo apt install \
      libssl-dev \
      libglib2.0-dev \
      libgtk-3-dev \
      libjavascriptcoregtk-4.1-dev \
      libwebkit2gtk-4.1-dev
   ```

</details>

## 以前にこのプロジェクトに貢献したことがある場合

::: warning

このリポジトリをクローンしていない場合は、このセクションをスキップしてください。

:::

ローカルリポジトリがアップストリームリポジトリと最新の状態であることを確認してください：

```shell
git fetch -all
git checkout main
git pull upstream main --rebase
```

作業中のブランチがある場合、ブランチをアップストリームリポジトリと最新の状態にするには：

```shell
git checkout <your-branch-name>
git rebase main
```

## このプロジェクトをフォークする

[moeru-ai/airi](https://github.com/moeru-ai/airi) ページの右上にある **Fork** ボタンをクリックしてください。

## クローン

```shell
git clone https://github.com/<your-github-username>/airi.git
cd airi
```

## 作業用ブランチを作成する

```shell
git checkout -b <your-branch-name>
```

## 依存関係のインストール

```shell
corepack enable
pnpm install

# Rust の依存関係用
# crates または apps/tamagotchi の開発を行わない場合は不要です
cargo fetch
```

::: tip

スクリプトを簡単にするために [@antfu/ni](https://github.com/antfu-collective/ni) のインストールをお勧めします。

```shell
corepack enable
npm i -g @antfu/ni
```

インストールしたら、以下のように使用できます

- `pnpm install`, `npm install`, `yarn install` の代わりに `ni` を使用。
- `pnpm run`, `npm run`, `yarn run` の代わりに `nr` を使用。

パッケージマネージャーを気にする必要はありません。`ni` が適切なものを選択してくれます。
:::

## 開発したいアプリケーションを選択する

### Stage Tamagotchi (デスクトップ版)

```shell
pnpm dev:tamagotchi
```

::: tip

[@antfu/ni](https://github.com/antfu-collective/ni) ユーザーの場合：

```shell
nr dev:tamagotchi
```

:::

### Stage Web (Web 版 [airi.moeru.ai](https://airi.moeru.ai) 用)

```shell
pnpm dev
```

::: tip

[@antfu/ni](https://github.com/antfu-collective/ni) ユーザーの場合：

```shell
nr dev
```

:::

### ドキュメントサイト

```shell
pnpm dev:docs
```

::: tip

[@antfu/ni](https://github.com/antfu-collective/ni) ユーザーの場合：

```shell
nr dev:docs
```

:::

### Telegram bot 統合

Postgres データベースが必要です。

```shell
cd services/telegram-bot
docker compose up -d
```

`.env` の設定

```shell
cp .env .env.local
```

`.env.local` 内の認証情報を編集します。

データベースのマイグレーション

```shell
pnpm -F @proj-airi/telegram-bot db:generate
pnpm -F @proj-airi/telegram-bot db:push
```

ボットの実行

```shell
pnpm -F @proj-airi/telegram-bot start
```

::: tip

[@antfu/ni](https://github.com/antfu-collective/ni) ユーザーの場合：

```shell
nr -F @proj-airi/telegram-bot dev
```

:::

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

## コミット

### コミットの前に

::: warning

リント (静的チェッカー) と TypeScript コンパイラが満たされていることを確認してください：

```shell
pnpm lint && pnpm typecheck
```

:::

::: tip

[@antfu/ni](https://github.com/antfu-collective/ni) がインストールされている場合は、`nr` を使用してコマンドを実行できます：

```shell
nr lint && nr typecheck
```

:::

### コミット

```shell
git add .
git commit -m "<your-commit-message>"
```

### フォークリポジトリへのプッシュ

```shell
git push origin <your-branch-name> -u
```

フォークリポジトリでブランチを閲覧できるはずです。

::: tip

このプロジェクトへの貢献が初めての場合は、アップストリームリポジトリも追加する必要があります：

```shell
git remote add upstream https://github.com/moeru-ai/airi.git
```

:::

## プルリクエストの作成

[moeru-ai/airi](https://github.com/moeru-ai/airi) ページに移動し、**Pull requests** タブをクリックし、**New pull request** ボタンをクリックします。**Compare across forks** リンクをクリックし、あなたのフォークリポジトリを選択します。

変更を確認し、**Create pull request** ボタンをクリックします。

## やったー！できました！

おめでとうございます！このプロジェクトへの最初の貢献を行いました。メンテナーがプルリクエストをレビューするのを待つことができます。
