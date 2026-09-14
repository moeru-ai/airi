---
title: 웹 앱 개발
description: AIRI 웹 앱 실행, 검사, 빌드
---

웹 앱은 `apps/stage-web`에 있으며 [airi.moeru.ai](https://airi.moeru.ai)를 구동합니다. 저장소 루트에서 다음을 실행하세요:

```shell
bun run dev
```

더 명시적인 명령을 사용할 수도 있습니다:

```shell
bun run dev:web
```

## 검증

```shell
bun run --filter @proj-airi/stage-web typecheck
bun run --filter @proj-airi/stage-web build
```

::: tip
[@antfu/ni](https://github.com/antfu-collective/ni)를 사용한다면 다음을 실행하세요:

```shell
nr dev
```
:::
