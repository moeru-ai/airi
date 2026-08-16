---
title: 文档站开发
description: 在本地编写、预览和验证 VitePress 文档
---

文档站位于 `docs`，内容按语言存放在 `docs/content/<locale>`。从仓库根目录运行：

```shell
pnpm dev:docs
```

仅检查文档站时，可运行：

```shell
pnpm -F @proj-airi/docs typecheck
pnpm -F @proj-airi/docs build
```

新增中文页面时，请同时在 `docs/.vitepress/config.ts` 的 `zh-Hans` sidebar 中添加入口；否则页面虽能通过 URL 打开，却不会出现在导航中。

::: tip

如果你使用 [@antfu/ni](https://github.com/antfu-collective/ni)，你可以：

```shell
nr dev:docs
```

:::
