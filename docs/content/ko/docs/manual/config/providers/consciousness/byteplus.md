---
title: BytePlus
description: AIRI에서 BytePlus 채팅 모델 설정하기
---

BytePlus는 AIRI에서 Ark 호환 채팅 서비스 설정을 사용합니다.

::: info 왜 BytePlus를 선택하나요?
BytePlus 계정에 Ark API 접근 권한이 있다면 이 제공자를 사용하세요.
:::

## BytePlus 자격 증명 준비하기

1. [BytePlus ModelArk 콘솔](https://console.byteplus.com/ark/region%3Aark%2Bap-southeast-1/apikey)에 로그인해 API Key를 생성하세요.

::: warning API Key 보안
API Key나 엔드포인트 자격 증명을 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 채팅 → BytePlus**를 열고 API Key를 입력하세요.
2. BytePlus 문서에서 다른 호환 API 루트를 안내하지 않는 한 기본 Base URL을 유지하세요. 모델은 AIRI의 제공자 목록에서 선택합니다. 이 폼에는 Endpoint ID나 모델 입력란이 없습니다.

## 설정 확인

1. **설정 유효성 검사**: AIRI는 설정을 수정하는 동안 자동으로 유효성을 검사합니다. **Ping API** 버튼이 보이면 실제 요청 테스트에 사용할 수 있습니다.
2. **모델 선택 →**: 유효성 검사가 통과되면 이 버튼으로 **설정 → 모듈 → 의식**을 열어 제공자와 모델을 선택하세요.

## 문제 해결

유효성 검사가 실패하면 API Key, Base URL, 계정 접근 권한, 네트워크 연결을 확인하세요. 모델을 사용할 수 없다면 제공자가 노출하는 목록에서 모델을 선택하세요.
