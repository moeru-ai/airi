---
title: 桌面端开发
description: 运行、检查和构建 Electron 桌面端
---

桌面端位于 `apps/stage-tamagotchi`，开发时从仓库根目录运行：

```shell
pnpm dev:tamagotchi
```

它会启动 Electron 开发环境。修改桌面端页面前，先查看共享组件和状态是否已在 `packages/stage-ui` 中实现；网页端和桌面端共用的逻辑应优先放在共享包中。

## 验证

```shell
pnpm -F @proj-airi/stage-tamagotchi typecheck
pnpm -F @proj-airi/stage-tamagotchi build
```

应用内的「系统 → 开发者」菜单及其每一项调试用途，请参阅[开发者工具](./desktop-developer-tools)。

::: tip

如果你使用 [@antfu/ni](https://github.com/antfu-collective/ni)，你可以：

```shell
nr dev:tamagotchi
```

:::
