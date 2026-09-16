---
title: Cerebras
description: AIRI에서 Cerebras 채팅 모델 설정하기
---

Cerebras는 호환 API를 통해 AIRI에서 채팅 모델을 제공합니다.

::: info 왜 Cerebras인가요?
이미 Cerebras API를 사용 중이고 계정에서 사용할 수 있는 모델을 AIRI에서 이용하고 싶다면 Cerebras를 선택하세요.
:::

## API Key 발급받기

[Cerebras Cloud](https://cloud.cerebras.ai/)에 로그인한 뒤 API Key를 생성하세요.

::: warning API Key 보안
API Key를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요.
:::

## AIRI에서 설정하기

**설정 → 제공자 → 채팅 → Cerebras**를 열고 **API Key**를 입력하세요. 기본 Base URL은 `https://api.cerebras.ai/v1/`입니다.

## 설정 확인

1. **설정 유효성 검사**: AIRI는 설정을 수정하는 동안 자동으로 유효성을 검사합니다. **Ping API** 버튼이 보이면 실제 요청 테스트에 사용할 수 있습니다.
2. **모델 선택 →**: 유효성 검사가 통과되면 이 버튼으로 **설정 → 모듈 → 의식**을 열어 제공자와 모델을 선택하세요.

## 문제 해결

API 확인이 실패하면 API Key, 계정 상태, 네트워크 연결을 확인하세요. AIRI가 모델 목록을 불러오지 못한다면 Base URL이 변경되지 않았는지 확인하거나, **의식** 페이지에서 Cerebras가 제공하는 정확한 모델 ID를 직접 입력하세요.
