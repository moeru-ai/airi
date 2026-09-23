---
title: Atlas Cloud
description: AIRI에서 Atlas Cloud를 채팅 제공자로 설정하기
is_openai_compatible: true
---

Atlas Cloud는 OpenAI 형식과 호환되는 채팅 API를 제공합니다. 설정을 완료한 후 **설정 → 모듈 → 의식**에서 Atlas Cloud 모델을 선택하세요.

::: info 왜 Atlas Cloud를 선택하나요?
이미 Atlas Cloud API Key가 있거나 Atlas Cloud가 제공하는 모델을 사용하고 싶다면 이 서비스 제공자를 바로 선택할 수 있습니다.
:::

## API Key 발급받기

1. [Atlas Cloud](https://www.atlascloud.ai/)에 접속해 계정을 등록하고 API Key를 생성하세요.
2. 키를 복사해 안전한 곳에 보관하세요.

::: warning API Key 보안
API Key를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요. 키가 유출되면 즉시 폐기하고 Atlas Cloud 콘솔에서 새 키를 만드세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 채팅 → Atlas Cloud**를 여세요.
2. 기본 설정에 API Key를 붙여넣으세요.
3. 기본 Base URL을 그대로 유지하세요: `https://api.atlascloud.ai/v1`.

## 설정 확인

1. **설정 유효성 검사**: AIRI는 설정을 수정하는 동안 자동으로 유효성을 검사합니다. **Ping API** 버튼이 보이면 실제 요청 테스트에 사용할 수 있습니다.
2. **모델 선택 →**: 유효성 검사가 통과되면 이 버튼으로 **설정 → 모듈 → 의식**을 열어 제공자와 모델을 선택하세요.

## 문제 해결

API 확인이 실패하면 API Key, 사용 가능한 크레딧 또는 할당량, 요청 한도, 네트워크 연결을 확인하세요. AIRI가 모델 목록을 불러오지 못하면 **의식** 페이지에서 Atlas Cloud가 제공하는 정확한 모델 ID를 직접 입력하세요.
