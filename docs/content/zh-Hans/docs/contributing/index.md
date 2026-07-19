---
title: 开发环境与首次贡献
description: 从本地运行 Project AIRI 到提交第一个拉取请求
---

你好呀！感谢你有兴趣参与 Project AIRI。本页说明如何建立本地开发环境、创建分支并提交第一个 Pull Request。

::: info 适用范围
本节面向需要修改源码、文档或设计资源的贡献者。若只是使用 AIRI，请从「用户手册」开始；应用内的调试工具请参阅[开发者工具](./desktop-developer-tools)。
:::

## 前置准备

- [Git](https://git-scm.com/downloads)
- [Node.js 当前 LTS 版本](https://nodejs.org/en/download/)
- [Corepack](https://github.com/nodejs/corepack)（随较新的 Node.js 一同提供）

<details>
<summary>Windows 平台相关设置</summary>

1. 打开 PowerShell。
2. 安装 [`scoop`](https://scoop.sh/)。

   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
   ```

3. 通过 `scoop` 安装 `git` 和 Node.js。

   ```powershell
   scoop install git nodejs
   ```

4. 通过 Corepack 启用仓库指定的 pnpm 版本：

   ```powershell
   corepack enable
   ```

</details>

<details>
<summary>macOS setup</summary>

0. 打开 Terminal, (或者 iTerm2, Ghostty, Kitty, etc.)
1. 通过 `brew` 安装 `git`, `node`

   ```shell
   brew install git node
   ```

2. 通过 Corepack 启用仓库指定的 pnpm 版本：

   ```shell
   corepack enable
   ```

</details>

<details>
<summary>Linux setup</summary>

0. 打开 Terminal。
1. 从 [Node.js 官网](https://nodejs.org/en/download/) 安装当前 LTS 版本。
2. 请参考该页面 [Git](https://git-scm.com/downloads/linux) 安装 `git`
3. 通过 Corepack 启用仓库指定的 pnpm 版本：

   ```shell
   corepack enable
   ```
</details>

## 如果你之前已经参与并贡献过本项目

::: tip

如果你并未克隆过该项目仓库，本步骤可跳过

:::

请先获取上游更新，再把自己的分支变基到最新 `main`：

```shell
git fetch --all
git switch main
git pull upstream main --rebase
```

如果你有自己的开发/工作分支，请按照如下方式同步至主分支：

```shell
git switch <your-branch-name>
git rebase main
```

## Fork 本项目

请点击 [moeru-ai/airi](https://github.com/moeru-ai/airi) 页面右上角的 **Fork** 按钮来 fork（分叉一个归属于你的账户的副本）本项目。

## 克隆本项目

```shell
git clone https://github.com/<your-github-username>/airi.git
cd airi
```

## 创建你自己的工作分支

```shell
git switch -c <your-branch-name>
```

## 安装依赖项

```shell
corepack enable
pnpm install
```

::: tip

推荐安装 [@antfu/ni](https://github.com/antfu-collective/ni) 来简化脚本命令

```shell
corepack enable
npm i -g @antfu/ni
```

安装后，你可以：

- 用 `ni` 来替代 `pnpm install`、`npm install` 和 `yarn install` 命令。
- 用 `nr` 来替代 `pnpm run`、`npm run` 和 `yarn run` 命令。

你无需费心选择包管理器， `ni` 会自动适配。
:::

## 提交代码（Commit）

### 提交前验证

提交前请确保代码已通过 Lint（静态分析器）和 类型安全检查：

```shell
pnpm lint
pnpm typecheck
```

::: tip

如果你安装了 [@antfu/ni](https://github.com/antfu-collective/ni)，你可以通过 `nr` 来运行命令：

```shell
nr lint && nr typecheck
```

:::

### 执行提交

```shell
git add <changed-files>
git commit -m "<your-commit-message>"
```

### 将你的代码推送（push）至先前 fork 或者拥有写入权限的 AIRI 仓库

```shell
git push -u origin <your-branch-name>
```

现在，你应该可以在 GitHub 上看到你的分支。

::: tip

如果这是你第一次贡献本项目，请添加上游（upstream，指向本项目）：

```shell
git remote add upstream https://github.com/moeru-ai/airi.git
```

:::

## 创建拉取请求（Pull Request）

请前往 [moeru-ai/airi](https://github.com/moeru-ai/airi) 页面：

* 点击 **Pull requests** 按钮；
* 再点击 **New pull request** 按钮；
* 选择 **Compare across forks** 链接；
* 然后选择你自己fork的代码仓库。

请检查并确认你的改动，最后点击 **Create pull request** 按钮完成拉取请求创建。

## 好欸！搞定了~

恭喜你成功地为本项目提交了首次贡献！现在可以等待项目的维护人员来审核你的拉取请求啦~
