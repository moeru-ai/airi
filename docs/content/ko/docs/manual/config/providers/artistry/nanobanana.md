---
title: Nano Banana (Artistry)
description: AIRI에서 Nano Banana 이미지 생성 설정하기
---

Nano Banana는 Google AI Studio API Key를 사용해 이미지를 생성합니다. **설정 → 제공자 → Artistry**에서 설정한 뒤, **설정 → 모듈 → Artistry**에서 활성화하세요.

::: info 왜 Nano Banana를 선택하나요?
이미 Google AI Studio API Key가 있고 AIRI에 내장된 Gemini 이미지 모델과 해상도 옵션을 바로 사용하고 싶다면 선택할 수 있습니다.
:::

## API Key 발급받기

1. [Google AI Studio API Keys](https://aistudio.google.com/app/apikey)에 로그인한 뒤 API Key를 만드세요.
2. 선택한 이미지 모델을 계정과 지역에서 사용할 수 있는지 확인하세요.
3. 키를 복사해 안전한 곳에 보관하세요.

::: warning API Key 보안
API Key를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요. 키가 유출되면 즉시 폐기하고 Google AI Studio에서 새 키를 만드세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → Artistry → Nano Banana**를 열고 API Key를 붙여넣으세요.
2. 기본 모델을 선택하세요: `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview` 또는 `gemini-2.5-flash-image`.
3. 기본 해상도를 선택하세요: 1K, 2K 또는 4K.

## 설정 확인

1. **설정 → 모듈 → Artistry**를 열고 **Nano Banana (Preview)**를 선택하세요.
2. **설정 → 모듈 → 의식**에서 도구/함수 호출을 지원하는 채팅 모델을 선택하세요.
3. 채팅으로 돌아가 AIRI에게 민감하지 않은 이미지를 생성해 달라고 요청하세요.
4. 이미지가 반환되면 API Key, 모델, 해상도, 도구 호출이 모두 정상 동작하는 것입니다.

## 문제 해결

인증이 실패하면 API Key가 유효한지 확인하세요. 이미지 생성이 실패하면 Google AI Studio 계정, 지역별 사용 가능 여부, 현재 모델 상태를 확인한 뒤 1K 해상도나 사용 가능한 다른 모델을 시도해 보세요.
