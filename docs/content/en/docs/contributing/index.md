---
title: Development Setup and Your First Contribution
description: Run Project AIRI locally and submit your first pull request
---

Hello! Thank you for your interest in contributing to Project AIRI. This guide explains how to set up a local development environment, create a branch, and submit your first pull request.

::: info Scope
This section is for contributors who want to change source code, documentation, or design resources. If you only want to use AIRI, start with the user manual. For the debugging tools built into the app, see [Developer Tools](./desktop-developer-tools).
:::

## Prerequisites

- [Git](https://git-scm.com/downloads)
- [mise](https://mise.jdx.dev/installing-mise.html), or another version manager that reads `.tool-versions`
- [Corepack](https://github.com/nodejs/corepack), which is included with the pinned Node.js 24.x release. Install it separately if you use Node.js 25 or later.

The repository pins Node.js in [`.tool-versions`](https://github.com/moeru-ai/airi/blob/main/.tool-versions) (currently 24.13.0). Install this version after you clone the repository. Do not use a different system version.

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
2. Follow the [Git installation instructions for Linux](https://git-scm.com/downloads/linux).
3. Install mise using the [package or installation method for your distribution](https://mise.jdx.dev/installing-mise.html).

</details>

## If you have contributed before

::: tip
Skip this section if you have not cloned the repository yet.
:::

If the `upstream` remote is not configured, add the Project AIRI repository before you fetch changes:

```shell
git remote add upstream https://github.com/moeru-ai/airi.git
```

Fetch upstream changes and rebase your local `main` branch:

```shell
git fetch --all
git switch main
git pull upstream main --rebase
```

If you already have a working branch, update it from `main`:

```shell
git switch <your-branch-name>
git rebase main
```

## Fork the project

Click **Fork** in the upper-right corner of the [moeru-ai/airi](https://github.com/moeru-ai/airi) repository page to create a copy under your account.

## Clone your fork

```shell
git clone https://github.com/<your-github-username>/airi.git
cd airi
```

## Create a working branch

```shell
git switch -c <your-branch-name>
```

## Install dependencies

From the repository root, install the Node.js version recorded in `.tool-versions`, verify it, enable Corepack, and install dependencies:

```shell
mise install
mise exec -- node --version
mise exec -- corepack enable
mise exec -- pnpm install
```

The reported Node.js version must match `.tool-versions`. The remaining examples assume that [mise is activated for your shell](https://mise.jdx.dev/dev-tools/shims.html); otherwise, run package-manager commands through `mise exec --`, for example `mise exec -- pnpm typecheck`.

::: tip
You can optionally install [@antfu/ni](https://github.com/antfu-collective/ni) to simplify package-manager commands:

```shell
mise exec -- npm install --global @antfu/ni
```

After installation:

- Use `ni` instead of `pnpm install`, `npm install`, or `yarn install`.
- Use `nr` instead of `pnpm run`, `npm run`, or `yarn run`.

`ni` detects the package manager used by the repository.
:::

## Commit your changes

### Validate before committing

Make sure the code passes linting and type checking:

```shell
pnpm lint
pnpm typecheck
```

::: tip
If you installed [@antfu/ni](https://github.com/antfu-collective/ni), run:

```shell
nr lint && nr typecheck
```
:::

### Create the commit

```shell
git add <changed-files>
git commit -m "<your-commit-message>"
```

### Push your branch

```shell
git push -u origin <your-branch-name>
```

Your branch should now be available on GitHub.

## Create a pull request

Open the [moeru-ai/airi](https://github.com/moeru-ai/airi) repository page:

1. Click **Pull requests**.
2. Click **New pull request**.
3. Click **Compare across forks**.
4. Select your fork and working branch.
5. Review the changes, then click **Create pull request**.

## You made it!

Congratulations on submitting your first contribution. The project maintainers can now review your pull request.
