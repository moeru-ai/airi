---
title: Documentation Site Development
description: Write, preview, and verify VitePress documentation locally
---


The documentation site lives in `docs`, and the content is stored per language under `docs/content/<locale>`. Run from the repository root:
```shell
pnpm dev:docs
```
To check only the documentation site, run:
```shell
pnpm -F @proj-airi/docs typecheck
pnpm -F @proj-airi/docs build
```
When adding a Chinese page, also add an entry to the `zh-Hans` sidebar in `docs/.vitepress/config.ts`; otherwise the page can be opened via its URL but will not appear in the navigation.
::: tip
If you use [@antfu/ni](https://github.com/antfu-collective/ni), you can:
```shell
nr dev:docs
```
:::
