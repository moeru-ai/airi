---
title: Xiaomi MiMo (TTS)
description: AIRI에서 Xiaomi MiMo 음성 합성 설정하기
---

MiMo는 프리셋 음성, 사운드 디자인, 음성 복제의 세 가지 음성 합성 모드를 지원합니다.

::: info 왜 Xiaomi MiMo를 선택하나요?
MiMo의 프리셋 중국어 음성이 필요하거나 텍스트 설명으로 음성을 디자인하고 싶다면 MiMo를 선택하세요.
:::

## API Key 발급받기

1. [Xiaomi MiMo Platform](https://platform.xiaomimimo.com/)에 로그인한 다음 계정에 API 접근이 활성화되어 있는지 확인하세요.
2. API Key를 생성하고 복사해 안전한 곳에 보관하세요.

::: warning 음성 샘플과 API Key 보안
음성 복제에는 Base64 data URI 형식의 오디오 샘플이 필요합니다. 사용 권한이 있는 샘플만 업로드하고, API Key나 타인의 음성 샘플을 절대 공개하지 마세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 음성 합성 → Xiaomi MiMo**에 API Key를 입력하세요.
2. 서비스 제공자가 다른 주소를 안내하지 않는 한 기본 Base URL인 `https://api.xiaomimimo.com/v1/`를 유지하세요.

## 설정 확인

1. 제공자 설정에서 모델과 사용 가능한 음성을 선택하세요.
2. 같은 페이지의 플레이그라운드에 짧은 텍스트를 입력하고 오디오가 재생되는지 확인하세요.

## AIRI 응답에 사용하기

**설정 → 모듈 → 음성 합성**을 열고 **Xiaomi MiMo**를 선택한 다음 사용 사례에 맞는 TTS 모델을 선택하세요:

- 프리셋 음성에는 `mimo-v2.5-tts`
- 텍스트 설명으로 만든 음성에는 `mimo-v2.5-tts-voicedesign`
- 사용 허가를 받은 음성 샘플에는 `mimo-v2.5-tts-voiceclone`

선택한 모드가 음성을 제공하면 음성을 선택하세요. 제공자 테스트만으로는 일반 응답에 음성이 활성화되지 않습니다.

## 문제 해결

요청이 실패하면 API Key, TTS 모델, 필요한 음성이나 프롬프트, 네트워크 연결을 확인하세요. 음성 복제가 실패하면 샘플이 유효한 Base64 data URI인지, 그리고 해당 녹음의 사용 권한이 있는지 확인하세요.
