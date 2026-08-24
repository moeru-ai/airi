---
title: OpenAI 및 호환 API
description: AIRI에서 OpenAI 또는 OpenAI 호환 채팅 서비스 설정하기
is_openai_compatible: true
---

공식 OpenAI 엔드포인트를 사용하려면 **OpenAI**를, 서드파티 호환 엔드포인트를 사용하려면 **OpenAI Compatible**을 선택하세요. 설정을 완료한 뒤 **설정 → 모듈 → 의식**에서 제공자와 채팅 모델을 선택하세요.

::: info 왜 OpenAI 또는 호환 API를 선택하나요?
이미 OpenAI API Key를 가지고 있거나, 서비스 제공자가 OpenAI 호환 채팅 인터페이스를 명시적으로 제공한다면 이 설정 방법을 사용할 수 있습니다. API 주소가 `/v1`로 끝나거나 키가 `sk-`로 시작한다는 것만으로는 서비스 호환성이 보장되지 않습니다.
:::

## API Key 발급받기

1. OpenAI 공식 서비스를 사용할 때는 [OpenAI API Keys](https://platform.openai.com/api-keys)를 여세요. 호환 서비스를 사용할 때는 해당 서비스 제공자의 관리 콘솔을 여세요.
2. API Key 또는 Developer Settings 페이지에서 API Key를 만드세요.
3. 키를 복사해 안전한 곳에 보관하세요.

::: warning API Key 보안
API Key를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요. 키가 유출되면 즉시 폐기하고 제공자 콘솔에서 새 키를 만드세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 채팅 → OpenAI** 또는 **OpenAI Compatible**을 여세요.
2. 기본 설정에 API Key를 붙여넣으세요.
3. OpenAI 공식 서비스를 사용할 때는 기본 Base URL인 `https://api.openai.com/v1`을 유지하세요. 호환 서비스를 사용할 때는 서비스 제공자 문서에 안내된 API 루트 주소를 입력하고, `/chat/completions` 경로를 뒤에 붙이지 마세요.

## 설정 확인

1. **설정 유효성 검사**: AIRI는 설정을 수정하는 동안 자동으로 유효성을 검사합니다. **Ping API** 버튼이 보이면 실제 요청 테스트에 사용할 수 있습니다.
2. **모델 선택 →**: 유효성 검사가 통과되면 이 버튼으로 **설정 → 모듈 → 의식**을 열어 제공자와 모델을 선택하세요.

## 문제 해결

API 확인이 실패하면 API Key, 사용 가능한 크레딧 또는 할당량, 요청 한도, 네트워크 연결을 확인하세요. 호환 서비스라면 해당 서비스가 OpenAI Chat Completions API를 지원하는지, Base URL이 제공자 문서에 안내된 API 루트인지 확인하세요.
