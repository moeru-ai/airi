---
title: Minecraft
description: Project AIRI에 기여하기
---

### Minecraft 에이전트

```shell
cd integrations/minecraft
```

Minecraft 클라이언트를 실행하고 원하는 포트로 월드를 개방한 뒤, 그 포트 번호를 `.env.local`에 입력하세요.

`.env` 설정하기

```shell
cp .env .env.local
```

`.env.local`에서 인증 정보를 수정하세요.

봇 실행하기

```shell
pnpm -F @proj-airi/minecraft-bot start
```

::: tip

[@antfu/ni](https://github.com/antfu-collective/ni) 사용자라면 이렇게 쓸 수 있습니다

```shell
nr -F @proj-airi/minecraft-bot dev
```

:::
