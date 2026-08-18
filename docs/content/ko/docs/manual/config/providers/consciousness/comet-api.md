---
title: CometAPI
description: AIRI에서 CometAPI 채팅 모델 설정하기
---

CometAPI는 AIRI에서 채팅 모델을 제공하며, 독립적인 TTS·STT 서비스 제공자 페이지도 있습니다.

::: info 왜 CometAPI를 선택하나요?
같은 CometAPI 계정으로 채팅, 음성 합성, 음성 인식을 함께 설정하고 싶다면 이 제공자를 선택할 수 있습니다.
:::

## API Key 발급받기

1. [CometAPI 콘솔](https://www.cometapi.com/console/token)에 로그인한 다음 API Key를 만드세요.

::: warning API Key 보안
API Key를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 채팅 → Comet API**를 열고 **API Key**를 입력하세요. 기본 Base URL은 `https://api.cometapi.com/v1/`입니다.

## 설정 확인

1. **설정 유효성 검사**: AIRI는 설정을 수정하는 동안 자동으로 유효성을 검사합니다. **Ping API** 버튼이 보이면 실제 요청 테스트에 사용할 수 있습니다.
2. **모델 선택 →**: 유효성 검사가 통과되면 이 버튼으로 **설정 → 모듈 → 의식**을 열어 제공자와 모델을 선택하세요.

## 문제 해결

제공자 유효성 검사가 실패하면 API Key, 사용 가능한 크레딧 또는 할당량, 요청 한도, 네트워크 연결을 확인하세요. 모델 목록을 불러오지 못하면 Base URL이 기본값 그대로인지 확인하거나, 의식 페이지에서 CometAPI가 제공하는 정확한 모델 ID를 입력하세요.
