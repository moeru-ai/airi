# Start contributing to [Project AIRI](https://github.com/moeru-ai/airi)

Hello! Thank you for your interest in contributing to this project. This guide will help you get started.

## Prerequisites

- [Git](https://git-scm.com/downloads)
- [mise](https://mise.jdx.dev/installing-mise.html), or another version manager that reads `.tool-versions`

The repository pins tool versions in [`.tool-versions`](../.tool-versions), including Node.js and pnpm.
The `packageManager` field in [`package.json`](../package.json) also specifies the pnpm version.
After you clone the repository, install these versions with mise.

<details>
<summary>Windows setup</summary>

1. Open PowerShell.
2. Install [`scoop`](https://scoop.sh/).

   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
   ```

3. Install Git and mise with Scoop.

   ```powershell
   scoop install git mise
   ```

</details>

<details>
<summary>macOS setup</summary>

1. Open Terminal, iTerm2, Ghostty, Kitty, or another terminal.
2. Install Git and mise with Homebrew.

   ```shell
   brew install git mise
   ```

</details>

<details>
<summary>Linux setup</summary>

1. Open a terminal.
2. Use the [Git installation instructions for Linux](https://git-scm.com/downloads/linux).
3. Install mise using the [package or installation method for your distribution](https://mise.jdx.dev/installing-mise.html).

</details>

## If you have already contributed to this project before

> [!WARNING]
>
> If you haven't cloned this repository, skip this section.

If the `upstream` remote is not configured, add the Project AIRI repository before you fetch changes:

```shell
git remote add upstream https://github.com/moeru-ai/airi.git
```

Fetch upstream changes and rebase your local `main` branch:

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
git clone https://github.com/<your-github-username>/airi.git
cd airi
```

## Create your working branch

```shell
git checkout -b <your-branch-name>
```

## Install dependencies

From the repository root, install the tools recorded in `.tool-versions`:

```shell
mise install
```

Make sure that the Node.js and pnpm versions match `.tool-versions`:

```shell
mise exec -- node --version
mise exec -- pnpm --version
```

The pnpm version must also match the `packageManager` field in `package.json`.

mise installs pnpm directly, so this setup does not require Corepack.

Install the project dependencies:

```shell
mise exec -- pnpm install
```

The remaining examples assume that [mise is activated for your shell](https://mise.jdx.dev/dev-tools/shims.html).
Otherwise, run package-manager commands through `mise exec --`, for example `mise exec -- pnpm typecheck`.

### Optional package-manager shortcuts

[@antfu/ni](https://github.com/antfu-collective/ni) detects the package manager used by the repository.

To use these shortcuts, install `@antfu/ni`:

```shell
mise exec -- npm install --global @antfu/ni
```

- Use `ni` instead of `pnpm install`, `npm install`, or `yarn install`.
- Use `nr` instead of `pnpm run`, `npm run`, or `yarn run`.

## Choose the application you want to develop on

### Stage Tamagotchi (Desktop version)

```shell
pnpm dev:tamagotchi
```

> [!NOTE]
>
> For [@antfu/ni](https://github.com/antfu-collective/ni) users, you can
>
> ```shell
> nr dev:tamagotchi
> ```

> [!NOTE]
>
> The `dev` and `start` scripts run `install-electron` before `electron-vite`.
>
> Electron 42 removed the `postinstall` script. The `electron` package now downloads its binary
> when you first run its `bin` entry. `electron-vite` reads `node_modules/electron/path.txt`
> directly, so it never starts that download. A fresh install therefore fails with
> `Error: Electron uninstall`.
>
> `install-electron` runs the same code as the removed `postinstall` script. It returns
> immediately when the binary is already present.
>
> Remove this step after `electron-vite` supports the lazy download.

### Stage Web (Browser version for [airi.moeru.ai](https://airi.moeru.ai))

```shell
pnpm dev
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
pnpm dev:docs
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
pnpm -F @proj-airi/telegram-bot db:generate
pnpm -F @proj-airi/telegram-bot db:push
```

Run the bot

```shell
pnpm -F @proj-airi/telegram-bot start
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
pnpm -F @proj-airi/discord-bot start
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
pnpm -F @proj-airi/minecraft-bot start
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
pnpm lint && pnpm typecheck
```

If you are committing images, consider using AVIF format instead of PNG, JPG etc. You can convert existing images to AVIF by running:

```shell
pnpm to-avif <PATH_TO_IMAGE_OR_DIRECTORY1> <PATH_2> <PATH_3> ...
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

## Creating Pull Request

Navigate to [moeru-ai/airi](https://github.com/moeru-ai/airi) page, click on the **Pull requests** tab, and click on the **New pull request** button, click on the **Compare across forks** link, and select your fork repository.

Review the changes, and click on the **Create pull request** button.

## Whooo-ya! You made it!

Congratulations! You made your first contribution to this project. You can now wait for the maintainers to review your pull request.
