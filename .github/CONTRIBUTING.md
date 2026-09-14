# Start contributing to [Project Moeka](https://github.com/cuwayo/moeka)

Hello! Thank you for your interest in contributing to this project. This guide will help you get started.

## Prerequisites

- [Git](https://git-scm.com/downloads)
- [Node.js 23+](https://nodejs.org/en/download/)
- [Bun 1.4+](https://bun.sh/docs/installation)

<details>
<summary>Windows setup</summary>

0. Open PowerShell
1. Install [`scoop`](https://scoop.sh/)

   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
   ```

2. Install `git` and Node.js through `scoop`

   ```powershell
   scoop install git nodejs
   ```

   > https://stackoverflow.com/a/64121601

3. Install `bun` through the official script

   ```powershell
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

</details>

<details>
<summary>macOS setup</summary>

0. Open Terminal (or iTerm2, Ghostty, Kitty, etc.)
1. Install `git`, `node` through `brew`

   ```shell
   brew install git node
   ```

2. Install `bun` through `brew`

   ```shell
   brew install oven-sh/bun/bun
   ```

</details>

<details>
<summary>Linux setup</summary>

0. Open terminal
1. Follow [nodesource/distributions: NodeSource Node.js Binary Distributions](https://github.com/nodesource/distributions?tab=readme-ov-file#table-of-contents) to install `node`
2. Follow [Git](https://git-scm.com/downloads/linux) to install `git`
3. Install `bun` through the official script

   ```shell
   curl -fsSL https://bun.sh/install | bash
   ```

</details>

## If you have already contributed to this project before

> [!WARNING]
>
> If you haven't cloned this repository, skip this section.

Make sure your local repository is up to date with the upstream repository:

```shell
git fetch --all
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
git clone https://github.com/<your-github-username>/moeka.git
cd moeka
```

## Create your working branch

```shell
git checkout -b <your-branch-name>
```

## Install dependencies

```shell
bun install
```

> [!NOTE]
>
> We would recommend to install [@antfu/ni](https://github.com/antfu-collective/ni) to make your script simpler.
>
> ```shell
> npm i -g @antfu/ni
> ```
>
> Once installed, you can
>
> - use `ni` for `bun install`, `npm install` and `yarn install`.
> - use `nr` for `bun run`, `npm run` and `yarn run`.
>
> You don't need to care about the package manager, `ni` will help you choose the right one.

## Choose the application you want to develop on

### Stage Web

```shell
bun run dev
```

> [!NOTE]
>
> For [@antfu/ni](https://github.com/antfu-collective/ni) users, you can
>
> ```shell
> nr dev
> ```

### UI Storyboard

Browse the live UI component storyboard at [airi.moeru.ai/ui](https://airi.moeru.ai/ui/).

### Documentation site

```shell
bun run dev:docs
```

> [!NOTE]
>
> For [@antfu/ni](https://github.com/antfu-collective/ni) users, you can
>
> ```shell
> nr dev:docs
> ```

### Telegram bot integration

A Postgres database is required.

```shell
cd integrations/telegram-bot
docker compose up -d
```

Configure `.env`

```shell
cp .env .env.local
```

Edit the credentials in `.env.local`.

Migrate the database

```shell
bun run --filter @proj-airi/telegram-bot db:generate
bun run --filter @proj-airi/telegram-bot db:push
```

Run the bot

```shell
bun run --filter @proj-airi/telegram-bot start
```

> [!NOTE]
>
> For [@antfu/ni](https://github.com/antfu-collective/ni) users, you can
>
> ```shell
> nr -F @proj-airi/telegram-bot dev
> ```

### Discord bot integration

```shell
cd integrations/discord-bot
```

Configure `.env`

```shell
cp .env .env.local
```

Edit the credentials in `.env.local`.

Run the bot

```shell
bun run --filter @proj-airi/discord-bot start
```

> [!NOTE]
>
> For [@antfu/ni](https://github.com/antfu-collective/ni) users, you can
>
> ```shell
> nr -F @proj-airi/discord-bot dev
> ```

### Minecraft agent

```shell
cd integrations/minecraft
```

Start a Minecraft client, export your world with desired port, and fill-in the port number in `.env.local`.

Configure `.env`

```shell
cp .env .env.local
```

Edit the credentials in `.env.local`.

Run the bot

```shell
bun run --filter @proj-airi/minecraft-bot start
```

> [!NOTE]
>
> For [@antfu/ni](https://github.com/antfu-collective/ni) users, you can
>
> ```shell
> nr -F @proj-airi/minecraft-bot dev
> ```

## Commit

### Before commit

Please make sure lint (static checkers) and TypeScript compilers are satisfied:

```shell
bun run lint && bun run typecheck
```

If you are committing images, consider using AVIF format instead of PNG, JPG etc. You can convert existing images to AVIF by running:

```shell
bun run to-avif <PATH_TO_IMAGE_OR_DIRECTORY1> <PATH_2> <PATH_3> ...
```

> [!NOTE]
>
> If you have [@antfu/ni](https://github.com/antfu-collective/ni) installed, you can use `nr` to run the commands:
>
> ```shell
> nr lint && nr typecheck
> ```

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

> [!NOTE]
>
> If this is your first time contributing to this project, you need to add the upstream repository too:
>
> ```shell
> git remote add upstream https://github.com/moeru-ai/airi.git
> ```

## Creating Pull Request

Navigate to [moeru-ai/airi](https://github.com/moeru-ai/airi) page, click on the **Pull requests** tab, and click on the **New pull request** button, click on the **Compare across forks** link, and select your fork repository.

Review the changes, and click on the **Create pull request** button.

## Whooo-ya! You made it!

Congratulations! You made your first contribution to this project. You can now wait for the maintainers to review your pull request.
