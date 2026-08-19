---
title: OpenRouter (TTS)
description: AIRI에서 OpenRouter를 음성 합성 서비스 제공자로 설정하기
---

OpenRouter는 여러 API를 통합해 제공하는 서비스 제공자입니다. 설정을 완료한 다음 **설정 → 모듈 → 음성 합성**에서 OpenRouter가 제공하는 모델과 음성을 선택하세요.

::: info 왜 OpenRouter Voice를 선택하나요?
지원되는 음성 합성 모델과 음성을 OpenRouter 계정으로 관리하고 싶다면 이 제공자를 선택하세요. 사용 가능 여부는 네트워크 환경, 결제 수단, OpenRouter 정책에 따라 달라질 수 있습니다.
:::

## API Key 발급받기

1. [OpenRouter API Keys](https://openrouter.ai/keys)를 열고 새 API Key를 생성하세요.
2. 키에 적절한 이름, 유효 기간, 할당량 제한을 설정하세요.
3. 키를 복사해 안전한 곳에 보관하세요.

::: warning API Key 보안
API Key를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요. 키가 유출되면 즉시 폐기하고 OpenRouter 콘솔에서 새 키를 만드세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 음성 합성 → OpenRouter**를 여세요.
2. 기본 설정에 API Key를 붙여넣으세요.
3. 기본 Base URL인 `https://openrouter.ai/api/v1/`를 그대로 유지하세요.

## 설정 확인

1. **설정 → 모듈 → 음성 합성**에서 설정한 제공자, 모델, 음성을 선택하세요.
2. 테스트 텍스트를 입력하고 **Test Voice**를 클릭하세요.
3. 테스트 오디오가 재생되면 제공자가 올바르게 설정된 것입니다. AIRI에 오류가 표시되면 오류 메시지를 참고해 자격 증명과 모델을 확인하세요.

## 문제 해결

소리가 나지 않으면 선택한 모델이 음성 출력을 제공하는지 확인하고, 계정 잔액과 네트워크 연결을 점검하세요.
