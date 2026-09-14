---
title: Web App Development
description: Run, check, and build the Moeka web app
---

The web app is in `apps/stage-web` and powers [airi.moeru.ai](https://airi.moeru.ai). From the repository root, run:

```shell
bun run dev
```

You can also use the more explicit command:

```shell
bun run dev:web
```

## Validation

```shell
bun run --filter @proj-airi/stage-web typecheck
bun run --filter @proj-airi/stage-web build
```

::: tip
If you use [@antfu/ni](https://github.com/antfu-collective/ni), run:

```shell
nr dev
```
:::
