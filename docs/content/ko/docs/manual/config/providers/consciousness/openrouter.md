---
title: OpenRouter
description: AIRI에서 OpenRouter를 채팅 제공자로 설정하기
is_openai_compatible: true
---

OpenRouter는 여러 모델을 모아 제공하는 API 서비스 제공자입니다. 이 페이지의 설정을 완료하면 AIRI가 의식에서 OpenRouter가 제공하는 채팅 모델을 사용할 수 있습니다.

::: info 왜 OpenRouter를 선택하나요?
OpenRouter는 하나의 API Key와 결제 계정으로 여러 모델 벤더에 접근하고 싶을 때 편리합니다. 각 업스트림 제공자를 따로 설정하지 않고도 OpenRouter가 노출하는 모델 사이를 전환할 수 있습니다. 다만 사용 가능 여부는 지역, 네트워크, 결제 수단, 제공자 정책에 따라 달라질 수 있습니다.
:::

## API Key 발급받기

1. [OpenRouter API Keys](https://openrouter.ai/keys)를 열고 새 API Key를 만드세요.
2. 키에 적절한 이름, 유효 기간, 할당량 제한을 설정하세요.
3. 키를 복사해 안전한 곳에 보관하세요.

::: warning API Key 보안
API Key를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요. 키가 유출되면 즉시 폐기하고 OpenRouter 콘솔에서 새 키를 만드세요.
:::


## AIRI에서 설정하기

1. **설정 → 제공자 → 채팅 → OpenRouter**를 여세요.
2. 기본 설정에 API Key를 붙여넣으세요.
3. 기본 Base URL을 그대로 유지하세요: `https://openrouter.ai/api/v1/`.

## 설정 확인

1. **설정 유효성 검사**: AIRI는 설정을 수정하는 동안 자동으로 유효성을 검사합니다. **Ping API** 버튼이 보이면 실제 요청 테스트에 사용할 수 있습니다.
2. **모델 선택 →**: 유효성 검사가 통과되면 이 버튼으로 **설정 → 모듈 → 의식**을 열어 사용 가능한 OpenRouter 모델을 선택하세요.

## 문제 해결

API 확인이 실패하면 API Key, 사용 가능한 크레딧 또는 할당량, 요청 한도, 네트워크 연결을 확인하세요. AIRI가 모델 목록을 불러오지 못하면 **의식** 페이지에서 OpenRouter가 제공하는 정확한 모델 ID를 직접 입력하세요.
