# Start contributing to [Project AIRI](https://github.com/moeru-ai/airi)

Thank you for your interest in Project AIRI. This guide explains how to set up the repository, run an application, validate changes, and open a pull request.

## Prerequisites

- [Git](https://git-scm.com/downloads)
- [mise](https://mise.jdx.dev/installing-mise.html), or another tool that reads `.tool-versions`

The repository pins Node.js and pnpm in [`.tool-versions`](../.tool-versions). The `packageManager` field in [`package.json`](../package.json) also pins pnpm.

### Windows

1. Open PowerShell.
2. Install [Scoop](https://scoop.sh/).

   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
   ```

3. Install Git and mise.

   ```powershell
   scoop install git mise
   ```

### macOS

Install Git and mise with Homebrew:

```shell
brew install git mise
```

### Linux

Install Git from the [Linux instructions](https://git-scm.com/downloads/linux). Install mise with the [method for your distribution](https://mise.jdx.dev/installing-mise.html).

## Fork and clone

1. Click **Fork** on the [moeru-ai/airi](https://github.com/moeru-ai/airi) repository page.
2. Clone your fork:

   ```shell
   git clone https://github.com/<your-github-username>/airi.git
   cd airi
   ```

3. Add the upstream repository:

   ```shell
   git remote add upstream https://github.com/moeru-ai/airi.git
   ```

4. Create a working branch:

   ```shell
   git switch -c <your-branch-name>
   ```

## Update an existing checkout

If you already contributed to the project, fetch upstream changes and update `main`:

```shell
git fetch --all
git switch main
git pull upstream main --rebase
```

Update an existing branch from `main`:

```shell
git switch <your-branch-name>
git rebase main
```

## Install dependencies

Run these commands from the repository root:

```shell
mise install
mise exec -- node --version
mise exec -- pnpm --version
mise exec -- pnpm install
```

The reported versions must match `.tool-versions` and `package.json`. Activate mise for your shell to omit `mise exec --`. Otherwise, use it before each pnpm command.

You can optionally install [@antfu/ni](https://github.com/antfu-collective/ni):

```shell
mise exec -- npm install --global @antfu/ni
```

Use `ni` instead of `pnpm install` and `nr` instead of `pnpm run` after installation.

## Run an application

Run commands from the repository root after you install dependencies.

### Stage Web

Start the browser application:

```shell
pnpm dev
```

Use `pnpm dev:web:https` when the local page needs HTTPS APIs. The browser application runs at the local URL shown in the terminal.

### Stage Tamagotchi

Start the Electron desktop application:

```shell
pnpm dev:tamagotchi
```

Build the desktop application with:

```shell
pnpm -F @proj-airi/stage-tamagotchi build
```

### Stage Pocket

Start an iOS device or simulator with its identifier:

```shell
pnpm dev:pocket:ios --target "<DEVICE_ID_OR_SIMULATOR_NAME>"
```

List available iOS devices and simulators:

```shell
pnpm -F @proj-airi/stage-pocket exec cap run ios --list
```

For Android, install Android Studio, the Android SDK, and Java 21. Then run:

```shell
pnpm dev:pocket:android
```

See [`apps/stage-pocket/android/README.md`](../apps/stage-pocket/android/README.md) for Android environment variables and device setup.

### Documentation site

Start the documentation site:

```shell
pnpm dev:docs
```

### UI storyboard

Start the shared UI storyboard:

```shell
pnpm dev:ui
```

### Backend services

Start the local backend stack with Docker:

```shell
pnpm dev:backend
```

Read [`server/README.md`](../server/README.md) before changing hosted backend code.

### Integrations

For an integration, install dependencies from the repository root, enter its directory, copy `.env` to `.env.local`, and fill in the required values.

Telegram requires a local PostgreSQL service:

```shell
cd integrations/telegram-bot
docker compose up -d
pnpm -F @proj-airi/telegram-bot db:generate
pnpm -F @proj-airi/telegram-bot db:push
pnpm -F @proj-airi/telegram-bot start
```

Start the Discord bot with:

```shell
pnpm -F @proj-airi/discord-bot start
```

Start the Minecraft service with:

```shell
pnpm -F @proj-airi/minecraft-bot dev
```

## Validate changes

Run linting and type checking before you commit:

```shell
pnpm lint
pnpm typecheck
```

Run the tests that cover the changed workspace. For the complete test suite, run:

```shell
pnpm test:run
```

If you change a shared package or exported type, run the root `pnpm typecheck` command.

## Commit and push

Add only the files for your change:

```shell
git add <changed-files>
git commit -m "<your-commit-message>"
git push -u origin <your-branch-name>
```

Use a [Conventional Commit](https://www.conventionalcommits.org/) message, such as `feat(stage-ui): add a provider control`.

## Create a pull request

Open the [moeru-ai/airi](https://github.com/moeru-ai/airi) repository page:

1. Click **Pull requests**.
2. Click **New pull request**.
3. Click **Compare across forks**.
4. Select your fork and working branch.
5. Review the changes and click **Create pull request**.

Include the user-visible behavior, the checks that you ran, and any follow-up work in the pull request description.
