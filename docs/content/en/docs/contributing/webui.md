---
title: Web App Development
description: Run, check, and build the AIRI web app
---

The web app is in `apps/stage-web` and powers [airi.moeru.ai](https://airi.moeru.ai). From the repository root, run:

```shell
pnpm dev
```

You can also use the more explicit command:

```shell
pnpm dev:web
```

## Validation

```shell
pnpm -F @proj-airi/stage-web typecheck
pnpm -F @proj-airi/stage-web build
```

::: tip
If you use [@antfu/ni](https://github.com/antfu-collective/ni), run:

```shell
nr dev
```
:::
