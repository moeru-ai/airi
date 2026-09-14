---
title: Documentation Site Development
description: Write, preview, and validate the VitePress documentation locally
---

The documentation site is in `docs`, with content organized by locale under `docs/content/<locale>`. From the repository root, run:

```shell
bun run dev:docs
```

To validate only the documentation site, run:

```shell
bun run --filter @proj-airi/docs typecheck
bun run --filter @proj-airi/docs build
```

When adding an English page, also add it to the `en` sidebar in `docs/.vitepress/config.ts`. Otherwise, the page will be available by URL but will not appear in the navigation.

::: tip
If you use [@antfu/ni](https://github.com/antfu-collective/ni), run:

```shell
nr dev:docs
```
:::
