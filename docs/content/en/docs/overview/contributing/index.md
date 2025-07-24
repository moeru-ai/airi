---
title: Contributing
description: Contributing to Project AIRI
---

Hello! Thank you for your interest in contributing to this project. This guide will help you get started.

## Prerequisites

- [Git](https://git-scm.com/downloads)
- [Node.js 23+](https://nodejs.org/en/download/)
- [corepack](https://github.com/nodejs/corepack)
- [pnpm](https://pnpm.io/installation)

<details>
<summary>Windows setup</summary>

0. Download [Visual Studio](https://visualstudio.microsoft.com/downloads/), and follow the instructions here: https://rust-lang.github.io/rustup/installation/windows-msvc.html#walkthrough-installing-visual-studio-2022

   > Make sure to install Windows SDK and C++ build tools when installing Visual Studio.

1. Open PowerShell
2. Install [`scoop`](https://scoop.sh/)

   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
   ```

3. Install `git`, Node.js, `rustup`, `msvc` through `scoop`

   ```powershell
   scoop install git nodejs rustup

   # For Rust dependencies
   # Not required if you are not going to develop on either crates or apps/tamagotchi
   scoop install main/rust-msvc
   # Rust & Windows specific
   rustup toolchain install stable-x86_64-pc-windows-msvc
   rustup default stable-x86_64-pc-windows-msvc
   ```

4. Install `pnpm` through `corepack`

   ```powershell
   corepack enable
   corepack prepare pnpm@latest --activate
   ```

</details>

<details>
<summary>macOS setup</summary>

0. Open Terminal, (or iTerm2, Ghostty, Kitty, etc.)
1. Install `git`, `node` through `brew`

   ```shell
   brew install git node
   ```

2. Install `pnpm` through `corepack`

   ```shell
   corepack enable
   corepack prepare pnpm@latest --activate
   ```

</details>

<details>
<summary>Linux setup</summary>

0. Open Terminal
1. Follow [nodesource/distributions: NodeSource Node.js Binary Distributions](https://github.com/nodesource/distributions?tab=readme-ov-file#table-of-contents) to install `node`
2. Follow [Git](https://git-scm.com/downloads/linux) to install `git`
3. Install `pnpm` through `corepack`

   ```shell
   corepack enable
   corepack prepare pnpm@latest --activate
   ```
4. If you would love to help to develop the desktop version, you will need those dependencies:
   ```
   sudo apt install \
      libssl-dev \
      libglib2.0-dev \
      libgtk-3-dev \
      libjavascriptcoregtk-4.1-dev \
      libwebkit2gtk-4.1-dev
   ```

</details>

## If you have already contributed to this project before

::: warning

If you haven't clone this repository, skip this section.

:::

Make sure your local repository is up to date with the upstream repository:

```shell
git fetch -all
git checkout main
git pull upstream main --rebase
```

If you have a working branch, to make your branch up to date with the upstream repository:

```shell
git checkout <your-branch-name>
git rebase main
```

## Fork this project

Click on the **Fork** button on the top right corner of the [moeru-ai/airi](https://github.com/moeru-ai/airi) page.

## Clone

```shell
git clone https://github.com/<your-github-username>/airi.git
cd airi
```

## Create your working branch

```shell
git checkout -b <your-branch-name>
```

## Install dependencies

```shell
corepack enable
pnpm install

# For Rust dependencies
# Not required if you are not going to develop on either crates or apps/tamagotchi
cargo fetch
```

::: tip

We would recommend to install [@antfu/ni](https://github.com/antfu-collective/ni) to make your script simpler.

```shell
corepack enable
npm i -g @antfu/ni
```

Once installed, you can

- use `ni` for `pnpm install`, `npm install` and `yarn install`.
- use `nr` for `pnpm run`, `npm run` and `yarn run`.

You don't need to care about the package manager, `ni` will help you choose the right one.
:::

## Choose the application you want to develop on

### Stage Tamagotchi (Desktop version)

```shell
pnpm dev:tamagotchi
```

::: tip

For [@antfu/ni](https://github.com/antfu-collective/ni) users, you can

```shell
nr dev:tamagotchi
```

:::

### Stage Web (Browser version for [airi.moeru.ai](https://airi.moeru.ai))

```shell
pnpm dev
```

::: tip

For [@antfu/ni](https://github.com/antfu-collective/ni) users, you can

```shell
nr dev
```

:::

### Documentation site

```shell
pnpm dev:docs
```

::: tip

For [@antfu/ni](https://github.com/antfu-collective/ni) users, you can

```shell
nr dev:docs
```

:::

### Telegram bot integration

A Postgres database is required.

```shell
cd services/telegram-bot
docker compose up -d
```

Configure `.env`

```shell
cp .env .env.local
```

Edit the credentials in `.env.local`.

Migrate the database

```shell
pnpm -F @proj-airi/telegram-bot db:generate
pnpm -F @proj-airi/telegram-bot db:push
```

Run the bot

```shell
pnpm -F @proj-airi/telegram-bot start
```

::: tip

For [@antfu/ni](https://github.com/antfu-collective/ni) users, you can

```shell
nr -F @proj-airi/telegram-bot dev
```

:::

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

## Commit

### Before commit

::: warning

Please make sure lint (static checkers) and TypeScript compilers are satisfied:

```shell
pnpm lint && pnpm typecheck
```

:::

::: tip

If you have [@antfu/ni](https://github.com/antfu-collective/ni) installed, you can use `nr` to run the commands:

```shell
nr lint && nr typecheck
```

:::

### Commit

```shell
git add .
git commit -m "<your-commit-message>"
```

### Push to your fork repository

```shell
git push origin <your-branch-name> -u
```

You should be able to browse the branch on your fork repository.

::: tip

If this is your first time contributing with this project, you need to add the upstream repository too:

```shell
git remote add upstream https://github.com/moeru-ai/airi.git
```

:::

## Creating Pull Request

Navigate to [moeru-ai/airi](https://github.com/moeru-ai/airi) page, click on the **Pull requests** tab, and click on the **New pull request** button, click on the **Compare across forks** link, and select your fork repository.

Review the changes, and click on the **Create pull request** button.

## Whooo-ya! You made it!

Congratulations! You made your first contribution to this project. You can now wait for the maintainers to review your pull request.
