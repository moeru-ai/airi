---
title: Google Gemini (TTS)
description: AIRI에서 Google Gemini 오디오 음성 합성 설정하기
---

Google Gemini Audio 음성 합성은 Gemini 자격 증명과 오디오 출력을 지원하는 모델을 사용합니다.

::: info 왜 Google Gemini를 선택하나요?
AIRI에 Google Gemini를 이미 설정했고 같은 서비스 제공자의 오디오 출력 기능을 사용하고 싶다면 이 옵션을 선택할 수 있습니다.
:::

## API Key 발급받기

1. [Google AI Studio](https://aistudio.google.com/app/apikey)에 로그인한 다음 API Key를 생성하세요.
2. 계정이 오디오 출력을 지원하는 Gemini 모델을 사용할 수 있는지 확인하세요.
3. 키를 복사해 안전한 곳에 보관하세요.

::: warning API Key 보안
Gemini API Key를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 음성 합성 → Google Gemini**에 Gemini API Key를 입력하세요.
2. 엔터프라이즈 게이트웨이나 호환 프록시를 사용하는 경우가 아니라면 인터페이스 기본 Base URL을 그대로 두세요.

## 설정 확인

1. 제공자 설정에서 모델과 사용 가능한 음성을 선택하세요.
2. 같은 페이지의 플레이그라운드에 짧은 텍스트를 입력하고 오디오가 재생되는지 확인하세요.

## AIRI 응답에 사용하기

**설정 → 모듈 → 음성 합성**을 열고 **Google Gemini**를 선택한 다음 사용 가능한 오디오 모델과 음성을 선택하세요. 플레이그라운드 테스트만으로는 일반 응답에 제공자가 활성화되지 않습니다.

## 문제 해결

확인에 실패하면 API Key, 계정의 리전별 사용 가능 여부, 네트워크 연결을 확인하세요. 요청은 성공하지만 소리가 나지 않으면 선택한 모델이 실제로 오디오 출력을 지원하는지 확인하세요.
