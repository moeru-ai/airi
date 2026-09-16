---
title: Telegram 봇
description: PostgreSQL과 모델 서비스를 사용해 AIRI를 Telegram 봇으로 실행하기
---

Telegram 봇을 실행하려면 Telegram Bot Token, PostgreSQL 벡터 데이터베이스, 모델 서비스가 필요합니다. 저장소의 Compose 서비스는 pgvector 호환 모드로 pgvecto.rs 0.4.0이 포함된 PostgreSQL을 실행합니다. 봇은 소스에서 직접 실행하도록 만들어졌습니다.

## 사전 준비 사항

- 저장소 루트에서 **pnpm i**로 의존성을 설치하세요.
- [@BotFather](https://t.me/BotFather)로 Telegram 봇을 만들고 토큰을 발급받으세요.
- 저장소의 PostgreSQL 벡터 서비스를 시작할 수 있도록 Docker를 준비하세요.
- 채팅 모델과 임베딩 모델 서비스를 준비하세요.

::: warning 자격 증명 보안
Telegram Bot Token, 데이터베이스 연결 정보, 모델 API Key는 로컬 **.env.local** 파일에만 보관하세요. 이 값을 커밋하거나, 스크린샷에 포함하거나, 공유하지 마세요.
:::

## 설정하기

```bash
cp integrations/telegram-bot/.env integrations/telegram-bot/.env.local
```

**integrations/telegram-bot/.env.local**을 편집해 **TELEGRAM_BOT_TOKEN**, 데이터베이스 연결 정보, 채팅 모델과 임베딩 모델 설정을 입력하세요. 임베딩 서비스의 출력 크기는 `EMBEDDING_DIMENSION`과 일치해야 하며, 지원되는 값은 `768`, `1024`, `1536`입니다.

## 데이터베이스 초기화

```bash
cd integrations/telegram-bot
docker compose up -d --wait pgvector
cd ../..
pnpm -F @proj-airi/telegram-bot db:push
```

저장소의 Compose 파일은 PostgreSQL을 호스트 포트 `5433`으로 노출합니다. 이 서비스를 사용할 때는 다음과 같이 설정하세요:

```env
DATABASE_URL=postgres://postgres:123456@localhost:5433/postgres
```

`pgvector`만 시작하면 선택 사항인 Grafana, Tempo, Prometheus, OpenTelemetry 서비스는 실행되지 않습니다.

## 시작하기

```bash
pnpm -F @proj-airi/telegram-bot start
```

## 참고 사항

데이터베이스, Telegram 토큰, 모델 자격 증명은 민감한 정보입니다. **.env.local**을 커밋하지 마세요. 첫 배포 전에 데이터베이스 백업과 접근 제어 방안도 확인하세요.
