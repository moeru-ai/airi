---
title: Minecraft 에이전트
description: 신뢰할 수 있는 Minecraft 서버에서 AIRI의 로컬 게임 에이전트 실행하기
---

Minecraft 통합은 Mineflayer를 사용해 AIRI를 Minecraft 서버에 연결합니다. 이를 통해 에이전트가 컨텍스트를 받고, 게임 내 행동을 수행하고, 상태를 보고할 수 있습니다. 이 통합은 로컬 개발과 유지보수 용도로 만들어졌습니다. 현재 구현은 Fabric 런타임으로 이전할 계획이므로, 이를 기반으로 새로운 장기 기능을 만들지 마세요.

## 사전 준비 사항

- 저장소 루트에서 **pnpm i**로 의존성을 설치하세요.
- 접속 가능한 로컬 또는 신뢰할 수 있는 Minecraft 서버를 준비하세요. 연결 주소와 포트는 환경 설정에서 가져옵니다.
- AIRI에서 동작하는 채팅 제공자와 모델을 설정하고, Minecraft 에이전트가 사용할 OpenAI 호환 모델 설정을 준비하세요.

::: warning 자격 증명 보안
API Key, 서비스 주소, Minecraft 서버 자격 증명은 로컬 **.env.local** 파일에만 보관하세요. 이 값을 커밋하거나, 스크린샷에 포함하거나, 공유하지 마세요.
:::

## 설정하기

```bash
cp integrations/minecraft/.env integrations/minecraft/.env.local
```

**integrations/minecraft/.env.local**을 편집해 필요한 Minecraft 서버, AIRI, 모델 서비스 설정을 입력하세요.

데스크톱 버전에서 **설정 → 연결**을 여세요. **Auth Token**을 표시한 뒤 복사하세요. 그런 다음 아래 AIRI 채널 설정을 추가하세요:

```env
AIRI_WS_BASEURL=ws://localhost:6121/ws
AIRI_CLIENT_NAME=minecraft-bot
AIRI_WS_TOKEN=<Auth Token from Settings → Connection>
```

또한 서버와 모델 서비스에 필요한 `BOT_HOSTNAME`, `BOT_PORT` 값과 `OPENAI_API_BASEURL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_REASONING_MODEL` 값을 설정하세요. 기본값은 로컬 환경과 일치할 때만 그대로 두세요.

## 시작하기

```bash
pnpm -F @proj-airi/minecraft-bot dev
```

시작한 후 터미널 출력에서 AIRI 인증이 성공했는지, 에이전트가 Minecraft 서버에 연결되었는지 확인하세요. `AIRI_WS_TOKEN`이 없거나 잘못되면 모듈이 AIRI에 등록되지 않습니다.

## 보안 및 제한 사항

신뢰할 수 없는 공개 서버에 에이전트를 연결하지 마세요. 에이전트는 로컬 Minecraft 세션과 네트워크 연결을 제어합니다. 행동 계획이 격리된 환경에서 실행되더라도, 악의적인 서버는 예기치 않은 동작을 일으킬 수 있습니다.
