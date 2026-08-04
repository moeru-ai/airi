---
title: Web Client Development
description: Run, check, and build the AIRI web client
---


The web client lives in `apps/stage-web` and corresponds to [airi.moeru.ai](https://airi.moeru.ai). Run from the repository root:

```shell

pnpm dev

```


You can also use the more explicit command:

```shell

pnpm dev:web

```


## Verification

```shell

pnpm -F @proj-airi/stage-web typecheck

pnpm -F @proj-airi/stage-web build

```


::: tip


If you use [@antfu/ni](https://github.com/antfu-collective/ni), you can:

```shell

nr dev

```


:::

