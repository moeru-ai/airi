---
title: CometAPI (TTS)
description: AIRI에서 CometAPI 음성 합성 설정하기
---

CometAPI는 호환 인터페이스를 통해 음성 합성을 제공합니다.

::: info 왜 CometAPI를 선택하나요?
이미 CometAPI로 모델과 자격 증명을 관리하고 있다면, AIRI에서 API Key를 그대로 재사용할 수 있습니다.
:::

## API Key 발급받기

1. [CometAPI Console](https://www.cometapi.com/console/token)에 로그인한 뒤, API Key를 생성하세요.
2. 키를 복사해 안전한 곳에 보관하세요.

::: warning API Key 보안
API Key를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 음성 합성 → Comet API**를 열고 API Key를 입력하세요.
2. 기본 Base URL인 `https://api.cometapi.com/v1/`를 유지하세요. 프록시나 호환 게이트웨이를 사용할 때만 수정하세요.

## 설정 확인

1. 제공자 설정에서 모델과 사용 가능한 음성을 선택하세요.
2. 같은 페이지의 플레이그라운드에 짧은 텍스트를 입력하고 오디오가 재생되는지 확인하세요.

## AIRI 응답에 사용하기

**설정 → 모듈 → 음성 합성**을 열고 **Comet API**를 선택한 뒤, 사용 가능한 모델과 음성을 선택하세요. 플레이그라운드 테스트만으로는 일반 응답에 제공자가 활성화되지 않습니다.

## 문제 해결

확인에 실패하면 API Key, 계정 잔액, 네트워크 연결을 확인하세요. 모델 목록이 비어 있으면 계정이 현재 해당 음성 모델에 접근할 수 있는지 확인하세요.
