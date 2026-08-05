---
title: Development Environment and Your First Contribution
description: From running Project AIRI locally to submitting your first pull request
---


Hello! Thank you for your interest in contributing to Project AIRI. This page explains how to set up a local development environment, create a branch, and submit your first Pull Request.


::: info Scope


This section is for contributors who need to modify source code, documentation, or design assets. If you only want to use AIRI, start with the "User Manual"; for in-app debugging tools, see [Developer Tools](./desktop-developer-tools).


:::


## Prerequisites


- [Git](https://git-scm.com/downloads)
- [Node.js current LTS version](https://nodejs.org/en/download/)
- [Corepack](https://github.com/nodejs/corepack) (bundled with newer Node.js)


<details>
<summary>Windows-specific setup</summary>
1. Open PowerShell.
2. Install [`scoop`](https://scoop.sh/).
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
   ```
3. Install `git` and Node.js via `scoop`.
   ```powershell
   scoop install git nodejs
   ```
4. Enable the repository-pinned pnpm version via Corepack:
   ```powershell
   corepack enable
   ```
</details>

<details>
<summary>macOS setup</summary>
0. Open Terminal (or iTerm2, Ghostty, Kitty, etc.)
1. Install `git` and `node` via `brew`
   ```shell
   brew install git node
   ```
2. Enable the repository-pinned pnpm version via Corepack:
   ```shell
   corepack enable
   ```
</details>

<details>
<summary>Linux setup</summary>
0. Open Terminal.
1. Install the current LTS version from the [Node.js website](https://nodejs.org/en/download/).
2. Install `git` following the instructions on the [Git](https://git-scm.com/downloads/linux) page.
3. Enable the repository-pinned pnpm version via Corepack:
   ```shell
   corepack enable
   ```
</details>


## If You Have Contributed to This Project Before


::: tip


If you have not cloned this repository, you can skip this step.


:::


First fetch the upstream updates and rebase your branch onto the latest `main`:

```shell
git fetch --all

git switch main

git pull upstream main --rebase
```


If you have your own development/work branch, sync it to the main branch as follows:

```shell
git switch <your-branch-name>
git rebase main
```
## Fork This Project
Click the **Fork** button at the top right of the [moeru-ai/airi](https://github.com/moeru-ai/airi) page to fork a copy of this project into your account.
## Clone This Project
```shell
git clone https://github.com/<your-github-username>/airi.git
cd airi
```
## Create Your Own Work Branch
```shell
git switch -c <your-branch-name>
```
## Install Dependencies
```shell
corepack enable
pnpm install
```
::: tip
We recommend installing [@antfu/ni](https://github.com/antfu-collective/ni) to simplify script commands:
```shell
corepack enable
npm i -g @antfu/ni
```
After installation, you can:
- Use `ni` instead of `pnpm install`, `npm install`, and `yarn install`.
- Use `nr` instead of `pnpm run`, `npm run`, and `yarn run`.
You do not need to worry about choosing a package manager; `ni` adapts automatically.
:::
## Committing Code
### Verify Before Committing
Before committing, make sure the code passes lint (static analysis) and type-safety checks:
```shell
pnpm lint
pnpm typecheck
```
::: tip
If you installed [@antfu/ni](https://github.com/antfu-collective/ni), you can run commands with `nr`:
```shell
nr lint && nr typecheck
```
:::
### Make the Commit
```shell
git add <changed-files>
git commit -m "<your-commit-message>"
```
### Push Your Code to the Fork or a Write-Access AIRI Repository
```shell
git push -u origin <your-branch-name>
```
You should now be able to see your branch on GitHub.
::: tip
If this is your first time contributing to this project, add the upstream (pointing to this project):
```shell
git remote add upstream https://github.com/moeru-ai/airi.git
```
:::
## Creating a Pull Request
Go to the [moeru-ai/airi](https://github.com/moeru-ai/airi) page:
* Click the **Pull requests** button;
* Then click the **New pull request** button;
* Select the **Compare across forks** link;
* Then select your own fork.
Review and confirm your changes, then click **Create pull request** to finish creating the pull request.
## Done!
Congratulations on submitting your first contribution to this project! Now you can wait for the project maintainers to review your pull request.
