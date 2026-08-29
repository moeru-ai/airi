---
title: ElevenLabs (TTS)
description: AIRI에서 ElevenLabs 음성 합성 설정하기
---

ElevenLabs는 AIRI의 응답을 음성으로 합성합니다.

::: info 왜 ElevenLabs를 선택하나요?
ElevenLabs 계정의 음성을 AIRI에서 직접 선택해 사용하려면 이 제공자를 선택하세요.
:::

## API Key 발급받기

1. [ElevenLabs API Key Settings](https://elevenlabs.io/app/settings/api-keys)에 로그인한 다음 API Key를 생성하세요.
2. 키에 알아보기 쉬운 이름과 적절한 사용 제한을 지정하세요.
3. 키를 복사해 안전한 곳에 보관하세요.

::: warning API Key 보안
API Key를 커밋하거나, 스크린샷에 포함하거나, 누구와도 공유하지 마세요. 유출이 의심되면 즉시 폐기하고 ElevenLabs 콘솔에서 다시 생성하세요.
:::

## AIRI에서 설정하기

1. **설정 → 제공자 → 음성 합성 → ElevenLabs**를 여세요.
2. 기본 설정에 API Key를 붙여넣으세요.
3. 기본 Base URL은 ElevenLabs의 직접 API가 아니라 AIRI/UnSpeech 게이트웨이인 `https://unspeech.hyp3r.link/v1/`입니다. API Key, 합성할 텍스트, 모델/음성 선택, 반환된 오디오가 모두 이 게이트웨이를 거칩니다. 이 신뢰 경계를 수용할 수 있는 경우에만 사용하고, 그렇지 않으면 호환되는 자체 호스팅 게이트웨이 URL을 입력하거나 직접 연결되는 제공자를 선택하세요.

## 설정 확인

1. 제공자 플레이그라운드에서 사용 가능한 음성을 선택하세요. 이 페이지는 AIRI의 기본 ElevenLabs 모델을 사용합니다.
2. 같은 페이지의 플레이그라운드에 짧은 텍스트를 입력하고 오디오가 재생되는지 확인하세요.

## AIRI 응답에 사용하기

**설정 → 모듈 → 음성 합성**을 열고 **ElevenLabs**를 선택한 다음 사용 가능한 모델과 음성을 선택하세요. 플레이그라운드 테스트만으로는 일반 응답에 제공자가 활성화되지 않습니다.

## 문제 해결

플레이그라운드에서 요청을 완료할 수 없으면 API Key, 구독 문자 할당량, 요청 한도, 네트워크 연결을 확인하세요. 모델은 로드되지만 오디오가 재생되지 않으면 **설정 → 모듈 → 음성 합성**에서 유효한 모델과 음성이 선택되어 있는지 확인하세요.
