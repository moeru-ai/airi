---
title: Satori 봇
description: Project AIRI에 기여하기
---

### Satori 봇

```shell
cd integrations/satori-bot
```

`.env` 파일 설정하기:

```shell
cp .env .env.local
```

`.env.local`에서 각종 키와 설정 정보를 수정하세요.

봇 시작하기:

```shell
pnpm -F @proj-airi/satori-bot dev
```

::: tip

[@antfu/ni](https://github.com/antfu-collective/ni)를 쓰신다면 이렇게 할 수 있습니다:

```shell
nr -F @proj-airi/satori-bot dev
```

:::
