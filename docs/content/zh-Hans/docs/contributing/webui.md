---
title: 网页端开发
description: 运行、检查和构建 AIRI 网页端
---

网页端位于 `apps/stage-web`，对应 [airi.moeru.ai](https://airi.moeru.ai)。从仓库根目录运行：

```shell
pnpm dev
```

也可以使用更明确的命令：

```shell
pnpm dev:web
```

## 验证

```shell
pnpm -F @proj-airi/stage-web typecheck
pnpm -F @proj-airi/stage-web build
```

::: tip

如果你使用 [@antfu/ni](https://github.com/antfu-collective/ni)，你可以：

```shell
nr dev
```

:::
