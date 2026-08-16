---
title: Discord 봇
description: Project AIRI에 기여하기
---

### Discord 봇 연동

```shell
cd integrations/discord-bot
```

`.env` 설정하기

```shell
cp .env .env.local
```

`.env.local`에서 인증 정보를 수정하세요.

봇 실행하기

```shell
pnpm -F @proj-airi/discord-bot start
```

::: tip

[@antfu/ni](https://github.com/antfu-collective/ni) 사용자라면 이렇게 쓸 수 있습니다

```shell
nr -F @proj-airi/discord-bot dev
```

:::
