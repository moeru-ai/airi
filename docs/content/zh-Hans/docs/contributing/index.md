---
title: 环境配置与基础准备
description: 参与并贡献 Project AIRI
---

你好呀！感谢你有兴趣参与这个项目。本指南将帮助你快速上手

## 前置准备

- [Git](https://git-scm.com/downloads)
- [Node.js 23+](https://nodejs.org/en/download/)
- [corepack](https://github.com/nodejs/corepack)
- [pnpm](https://pnpm.io/installation)

<details>
<summary>Windows 平台相关设置</summary>

0. 下载 [Visual Studio](https://visualstudio.microsoft.com/downloads/), 根据这个教程安装 https://rust-lang.github.io/rustup/installation/windows-msvc.html#walkthrough-installing-visual-studio-2022

   > 安装时请确保勾选了 Windows SDK 和 MSVC C++ build tools

::: tip

建议使用Visual Studio 2022 版以达到更好的兼容性

:::

1. 打开 PowerShell
2. 安装 [`scoop`](https://scoop.sh/)

   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
   ```

3. 通过 `scoop` 安装 `git`, Node.js, `rustup` 和 `msvc`

   ```powershell
   scoop install git nodejs rustup

   # Rust 相关依赖
   # 如果你不打算涉及 crates 或者 apps/tamagotchi 的开发，该步骤可跳过
   scoop install main/rust-msvc
   # Windows 平台所需内容
   rustup toolchain install stable-x86_64-pc-windows-msvc
   rustup default stable-x86_64-pc-windows-msvc
   ```

4. 通过 `corepack` 安装 `pnpm`

   ```powershell
   corepack enable
   corepack prepare pnpm@latest --activate
   ```

</details>

<details>
<summary>macOS setup</summary>

0. 打开 Terminal, (或者 iTerm2, Ghostty, Kitty, etc.)
1. 通过 `brew` 安装 `git`, `node`

   ```shell
   brew install git node
   ```

2. 通过 `corepack` 安装 `pnpm`

   ```shell
   corepack enable
   corepack prepare pnpm@latest --activate
   ```

</details>

<details>
<summary>Linux setup</summary>

0. 打开 Terminal
1. 请按照该说明的内容 [nodesource/distributions: NodeSource Node.js Binary Distributions](https://github.com/nodesource/distributions?tab=readme-ov-file#table-of-contents) 安装 `node`
2. 请参考该页面 [Git](https://git-scm.com/downloads/linux) 安装 `git`
3. 通过 `corepack` 安装 `pnpm`

   ```shell
   corepack enable
   corepack prepare pnpm@latest --activate
   ```
4. 如果你想进行桌面端的开发，你还需要下载如下依赖：
   ```shell
   sudo apt install \
      libssl-dev \
      libglib2.0-dev \
      libgtk-3-dev \
      libjavascriptcoregtk-4.1-dev \
      libwebkit2gtk-4.1-dev
   ```

</details>

## 如果你之前已经参与并贡献过本项目

::: tip

如果你并未克隆过该项目仓库，本步骤可跳过

:::

请确保你的本地仓库与主仓库保持最新同步：

```shell
git fetch --all
git checkout main
git pull upstream main --rebase
```

如果你有自己的开发/工作分支，请按照如下方式同步至主分支：

```shell
git checkout <your-branch-name>
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
git checkout -b <your-branch-name>
```

## 安装依赖项

```shell
corepack enable
pnpm install

# Rust相关依赖
# 如果你不打算涉及 crates 或者 apps/tamagotchi 的开发，该步骤可跳过
cargo fetch
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

::: warning Visual Studio 2026 兼容提示

如果你使用的 Visual Studio 为 2026 版，安装依赖时可能会报错

```shell
gyp ERR! stack Error: Could not find any Visual Studio installation to use
gyp ERR! stack Error: Could not find any Visual Studio installation to use
```

这是因为编译工具链使用的 node-gyp 暂未兼容新版 Visual Studio 2026。在 Powershell 中按如下操作强制指定新版 node-gyp 即可通过编译

```shell
npm i -g "node-gyp@>=12.2.0"
$env:npm_config_node_gyp = (Join-Path (npm root -g) "node-gyp\bin\node-gyp.js")
```

:::

## 提交代码（Commit）

### 提交前请检查

提交前请确保代码已通过 Lint（静态分析器）和 类型安全检查：

```shell
pnpm lint && pnpm typecheck
```

::: tip

如果你安装了 [@antfu/ni](https://github.com/antfu-collective/ni)，你可以通过 `nr` 来运行命令：

```shell
nr lint && nr typecheck
```

:::

### 执行提交

```shell
git add .
git commit -m "<your-commit-message>"
```

### 将你的代码推送（push）至先前 fork 或者拥有写入权限的 AIRI 仓库

```shell
git push origin <your-branch-name> -u
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
