---
title: Satori 봇
description: Koishi와 Satori 프로토콜을 통해 AIRI를 여러 메시징 플랫폼에 연결하기
---

Satori 봇은 Koishi의 Satori 서비스를 통해 QQ, Telegram, Discord, Lark 같은 메시징 플랫폼에 연결됩니다. 현재의 독립 실행형 코어는 과도기적 구현으로 실험과 유지보수에 적합하며, 안정적인 AIRI Core 통합으로 간주해서는 안 됩니다.

## 사전 준비 사항

- 저장소 루트에서 **pnpm i**로 의존성을 설치하세요.
- **server-satori** 플러그인이 활성화된 Koishi 인스턴스를 실행하세요.
- OpenAI 호환 API를 제공하는 모델 서비스를 준비하세요.

::: warning 자격 증명 보안
Satori 토큰, 메시징 플랫폼 자격 증명, 모델 API Key는 로컬 **.env.local** 파일에만 보관하세요. 이 값을 커밋하거나, 스크린샷에 포함하거나, 공유하지 마세요.
:::

## 설정

```bash
cp integrations/satori-bot/.env integrations/satori-bot/.env.local
```

**integrations/satori-bot/.env.local**을 편집해 **SATORI_WS_URL**, **SATORI_API_BASE_URL**, 선택 사항인 **SATORI_TOKEN**, 그리고 LLM 주소·키·모델을 입력하세요.

## 시작

```bash
pnpm -F @proj-airi/satori-bot dev
```

## 참고 사항

메시징 플랫폼 주소, 토큰, 모델 자격 증명은 민감한 정보입니다. **.env.local**을 커밋하거나 그 내용을 누구에게도 보내지 마세요.
