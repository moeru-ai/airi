---
title: Moonshot AI
description: AIRI에서 Moonshot AI를 채팅 제공자로 설정하기
is_openai_compatible: true
---

Moonshot AI는 OpenAI 형식과 호환되는 채팅 API를 제공합니다. 이 페이지의 설정을 마치면 AIRI는 의식에서 Moonshot AI 모델을 사용할 수 있습니다.

::: info 왜 Moonshot을 선택하나요?
AIRI에서 Moonshot 모델을 사용하고 싶거나 이미 Moonshot API Key가 있다면 이 제공자를 바로 선택할 수 있습니다.
:::

## API Key 발급받기

1. [Moonshot Global 콘솔](https://platform.moonshot.ai/)을 여세요.
2. API Keys 페이지에서 새 API Key를 생성하세요.
3. 키를 복사해 안전한 곳에 보관하세요.

::: warning API Key 보안
API Key를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요. 키가 유출되면 즉시 폐기하고 Moonshot 콘솔에서 새 키를 만드세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 채팅 → Moonshot AI**를 여세요.
2. 기본 설정에 API Key를 붙여 넣으세요.
3. 글로벌 Base URL인 `https://api.moonshot.ai/v1/`를 유지하세요. `platform.moonshot.cn`에서 발급한 키는 해당 콘솔 문서에 안내된 중국 엔드포인트를 사용해야 하며, 리전 간에 자격 증명과 엔드포인트를 섞어 쓸 수 없습니다.

## 설정 확인

1. **설정 유효성 검사**: AIRI는 설정을 수정하는 동안 자동으로 유효성을 검사합니다. **Ping API** 버튼이 보이면 실제 요청 테스트에 사용할 수 있습니다.
2. **모델 선택 →**: 유효성 검사가 통과되면 이 버튼으로 **설정 → 모듈 → 의식**을 열어 제공자와 모델을 선택하세요.

## 문제 해결

API 확인이 실패하면 API Key, 사용 가능한 크레딧 또는 할당량, 요청 한도, 네트워크 연결을 확인하세요. AIRI가 모델 목록을 불러오지 못하면 **의식** 페이지에서 Moonshot이 제공하는 정확한 모델 ID를 직접 입력하세요.
