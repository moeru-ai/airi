---
title: Desktop Development
description: Run, check, and build the Electron desktop app
---

The desktop app is in `apps/stage-tamagotchi`. From the repository root, run:

```shell
pnpm dev:tamagotchi
```

This starts the Electron development environment. Before changing desktop pages, check whether the relevant shared component or state already exists in `packages/stage-ui`. Logic used by both the web and desktop apps should normally live in a shared package.

## Validation

```shell
pnpm -F @proj-airi/stage-tamagotchi typecheck
pnpm -F @proj-airi/stage-tamagotchi build
```

For the **System → Developer** menu and the purpose of each debugging tool, see [Developer Tools](./desktop-developer-tools).

::: tip
If you use [@antfu/ni](https://github.com/antfu-collective/ni), run:

```shell
nr dev:tamagotchi
```
:::
