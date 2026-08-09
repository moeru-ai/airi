---
title: Telegram 봇
description: Project AIRI에 기여하기
---

### Telegram 봇 연동

Postgres 데이터베이스가 필요합니다.

```shell
cd integrations/telegram-bot
docker compose up -d
```

`.env` 설정하기

```shell
cp .env .env.local
```

`.env.local`에서 인증 정보를 수정하세요.

데이터베이스 마이그레이션

```shell
pnpm -F @proj-airi/telegram-bot db:generate
pnpm -F @proj-airi/telegram-bot db:push
```

봇 실행하기

```shell
pnpm -F @proj-airi/telegram-bot start
```

::: tip

[@antfu/ni](https://github.com/antfu-collective/ni) 사용자라면 이렇게 쓸 수 있습니다

```shell
nr -F @proj-airi/telegram-bot dev
```

:::
