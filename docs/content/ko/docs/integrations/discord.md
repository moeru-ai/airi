---
title: Discord 봇
description: Discord 애플리케이션으로 AIRI를 음성·메시징 봇으로 실행하기
---

Discord 봇은 Discord 서버의 텍스트 채널과 음성 채널에 연결됩니다. 텍스트 응답은 AIRI에서 선택한 채팅 제공자와 모델을 사용합니다.

## 사전 준비 사항

- 저장소 루트에서 **pnpm i**로 의존성을 설치하세요.
- [Discord Developer Portal](https://discord.com/developers/home)에서 애플리케이션과 봇을 만드세요.
- 봇 설정에서 **Message Content Intent**를 활성화하세요.
- AIRI에서 동작하는 채팅 제공자와 모델을 설정하세요.

::: warning 자격 증명 보안
Bot Token과 AIRI Auth Token은 AIRI의 로컬 설정 또는 봇 서비스의 로컬 **.env.local** 파일에만 보관하세요. 이 자격 증명을 커밋하거나, 스크린샷에 포함하거나, 공유하지 마세요.
:::

## 봇 서비스 설정

```bash
cp integrations/discord-bot/.env integrations/discord-bot/.env.local
```

데스크톱 버전에서 **설정 → 연결**을 여세요. **Auth Token**을 표시하고 복사하세요. 그런 다음 **integrations/discord-bot/.env.local**에 아래 값을 추가하세요:

```env
AIRI_URL=ws://localhost:6121/ws
AIRI_TOKEN=<Auth Token from Settings → Connection>
```

`DISCORD_TOKEN`은 시작 시점에 사용하는 선택적 대체값입니다. 비워 두고 서비스가 연결된 뒤 AIRI에서 Bot Token을 보낼 수 있습니다. 서비스는 `DISCORD_BOT_CLIENT_ID`, `OPENAI_MODEL`, `OPENAI_API_*`, `ELEVENLABS_*`를 사용하지 않습니다. Discord 텍스트 응답은 AIRI의 활성 채팅 설정을 사용합니다.

Discord 음성 입력을 사용하려면 `OPENAI_STT_API_BASE_URL`, `OPENAI_STT_API_KEY`, `OPENAI_STT_MODEL`로 OpenAI 호환 전사 엔드포인트를 설정하세요. 텍스트 채널에는 이 값이 필요하지 않지만, 이 값 없이는 음성 전사가 완료되지 않습니다.

## 서비스 시작

```bash
pnpm -F @proj-airi/discord-bot start
```

## AIRI에서 Discord 설정하기

1. **설정 → 모듈 → Discord**를 여세요.
2. **Bot Token**에 봇 토큰을 붙여넣으세요.
3. **Enable Discord Integration**을 켜세요.
4. **저장**을 클릭하세요.

인증된 봇 서비스는 AIRI의 설정 채널을 통해 활성화 상태와 토큰을 전달받습니다. 서비스가 실행 중이 아니거나 서비스의 AIRI Auth Token이 없거나 잘못된 경우, 이 필드를 저장하는 것만으로는 Discord 봇이 시작되지 않습니다.

## Discord에서 봇 설치 및 사용

1. Discord Developer Portal에서 `bot` 스코프로 **Guild Install**을 구성하고 봇을 서버에 설치하세요. `bot` 스코프는 기본적으로 `applications.commands`를 포함합니다. 사용하는 기능에 필요한 권한만 부여하세요:
   - 텍스트 응답: **View Channels**와 **Send Messages**.
   - 음성 입력: **View Channels**와 **Connect**.
   - 음성 재생: **Speak**.
2. 텍스트 채팅은 봇에게 다이렉트 메시지를 보내거나 서버 채널에서 봇을 멘션하세요. 봇이 모든 서버 메시지에 응답하지는 않습니다.
3. 음성 입력은 음성 채널에 참여한 뒤 `/summon`을 실행하세요. 서비스는 봇이 로그인한 후 `/ping`과 `/summon`을 등록합니다.

봇이 일부 채널에서만 동작하고 다른 채널에서는 동작하지 않으면, 채널 수준의 권한 재정의를 확인하세요.

## 보안 참고 사항

봇의 접근 권한을 필요한 채널과 기능으로만 제한하세요. Bot Token을 분실했거나 유출됐다면 Discord Developer Portal에서 즉시 재설정하세요.
