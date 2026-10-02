---
title: Volcengine Coding Plan
description: AIRI에서 Volcengine Coding Plan 채팅 모델 설정하기
---

Volcengine Coding Plan은 AIRI에서 독립된 제공자 카드로 제공됩니다.

::: info 왜 Volcengine Coding Plan을 선택하나요?
계정에서 Volcengine Coding Plan을 사용하고 있다면 해당 서비스 플랜에 맞는 이 카드를 선택하세요.
:::

## Coding Plan 자격 증명 준비하기

1. [Volcengine Ark Coding Plan 콘솔](https://console.volcengine.com/ark/region%3Acn-beijing/subscription/coding-plan)에 로그인해 Coding Plan API Key를 발급받으세요.

::: warning API Key 보안
API Key나 엔드포인트 자격 증명을 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 채팅 → Volcengine Coding Plan**을 열고 API Key를 입력하세요.
2. Coding Plan 문서에서 다른 호환 API 루트를 안내하지 않는 한 기본 **Base URL**을 그대로 유지하세요. 모델은 AIRI의 정적 제공자 목록에서 가져오며, 이 양식에는 Endpoint ID나 모델 필드가 없습니다.

## 설정 확인

1. **설정 유효성 검사**: AIRI는 설정을 수정하는 동안 자동으로 유효성을 검사합니다. **Ping API** 버튼이 보이면 실제 요청 테스트에 사용할 수 있습니다.
2. **모델 선택 →**: 유효성 검사가 통과되면 이 버튼으로 **설정 → 모듈 → 의식**을 열어 사용 가능한 모델을 선택하세요.

## 문제 해결

유효성 검사가 실패하면 API Key가 활성 상태의 Volcengine Coding Plan에 속하는지, Base URL이 올바른지 확인하세요. 목록에 있는 모델이 거부되면 플랜에 해당 모델 접근 권한이 있는지 확인하세요.
