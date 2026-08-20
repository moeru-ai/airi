---
title: MiniMax Global
description: MiniMax 해외 버전을 AIRI의 채팅 제공자로 설정하기
is_openai_compatible: true
---

이 페이지는 MiniMax 해외 플랫폼에서 생성한 API Key에 적용됩니다. 설정을 마치면 AIRI는 의식에서 MiniMax Global이 제공하는 채팅 모델을 사용할 수 있습니다.

::: info 왜 MiniMax Global을 선택하나요?
MiniMax 해외 플랫폼에서 API Key를 생성했거나 해외 Token Plan을 사용한다면 MiniMax Global을 선택해야 합니다. 중국 본토 플랫폼에서 생성한 Key는 [MiniMax (중국 본토)](./minimax.md)를 사용하세요. 두 플랫폼의 API Key, 과금, Base URL은 섞어 쓸 수 없습니다.
:::

## API Key 발급받기

1. [MiniMax Global 플랫폼](https://platform.minimax.io/)에 로그인하세요.
2. **API Keys**에서 종량제 API Key를 생성하세요. Token Plan을 사용한다면 해당 구독 페이지에서 전용 Key를 발급받으세요.
3. 키를 복사해 안전한 곳에 보관하세요.

::: warning API Key 보안
API Key를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요. 키가 유출되면 즉시 폐기하고 MiniMax Global 플랫폼에서 새 키를 만드세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 채팅 → MiniMax Global**을 여세요.
2. 기본 설정에 API Key를 붙여 넣으세요.
3. 기본 Base URL인 `https://api.minimax.io/v1/`를 유지하세요.

## 설정 확인

1. **설정 유효성 검사**: AIRI는 설정을 수정하는 동안 자동으로 유효성을 검사합니다. **Ping API** 버튼이 보이면 실제 요청 테스트에 사용할 수 있습니다.
2. **모델 선택 →**: 유효성 검사가 통과되면 이 버튼으로 **설정 → 모듈 → 의식**을 열어 제공자와 모델을 선택하세요.
3. **설정 → 모듈 → 의식**에서 MiniMax Global과 모델을 선택한 뒤, 짧은 메시지를 보내 AIRI가 응답하는지 확인하세요.

## 문제 해결

API 확인이 실패하면 API Key가 글로벌 플랫폼에서 발급된 것인지, Base URL이 `https://api.minimax.io/v1/`인지, 계정에 사용 가능한 크레딧이나 할당량이 있는지, 요청 제한에 걸리지 않았는지, 네트워크에서 서비스에 접근할 수 있는지 확인하세요. `401` 응답은 대개 중국 본토 키를 글로벌 엔드포인트에 사용했거나 그 반대인 경우를 의미합니다. AIRI가 모델 목록을 불러오지 못하면 **의식** 페이지에서 MiniMax Global의 정확한 모델 ID를 직접 입력하세요.
