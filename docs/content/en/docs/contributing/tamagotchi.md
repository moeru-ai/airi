---
title: Desktop Development
description: Run, check, and build the Electron desktop client
---


The desktop client lives in `apps/stage-tamagotchi`. For development, run from the repository root:

```shell
pnpm dev:tamagotchi
```


This starts the Electron development environment. Before modifying desktop pages, first check whether the shared components and state are already implemented in `packages/stage-ui`; logic shared between the web and desktop clients should preferably live in the shared package.


## Verification

```shell
pnpm -F @proj-airi/stage-tamagotchi typecheck

pnpm -F @proj-airi/stage-tamagotchi build
```


For the in-app "System → Developer" menu and the debugging purpose of each item, see [Developer Tools](./desktop-developer-tools).


::: tip


If you use [@antfu/ni](https://github.com/antfu-collective/ni), you can:

```shell
nr dev:tamagotchi
```


:::

